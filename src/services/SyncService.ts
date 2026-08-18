import { db, Project, Task, User, Comment } from '../db/db';
import { googleSheetsService } from './googleSheets';

export class SyncService {
  async connectProjectToSheets(projectId: string, spreadsheetInput?: string): Promise<string> {
    const project = await db.getById<Project>('projects', projectId);
    if (!project) throw new Error('Project not found');

    const providedId = spreadsheetInput
      ? googleSheetsService.extractSpreadsheetId(spreadsheetInput)
      : null;

    if (spreadsheetInput && !providedId) {
      throw new Error('Invalid Google Sheets link or spreadsheet id');
    }

    const spreadsheetId =
      providedId ||
      project.spreadsheetId ||
      await googleSheetsService.createSpreadsheet(project.name);

    await googleSheetsService.setupHeaders(spreadsheetId);

    // If the linked sheet changed, reset lastSyncedAt to 0 so pushProject
    // knows to pull from the new sheet before writing anything.
    const lastSyncedAt = spreadsheetId === project.spreadsheetId ? (project.lastSyncedAt ?? 0) : 0;
    await db.put('projects', { ...project, spreadsheetId, lastSyncedAt });

    await this.pushProject(projectId);
    return spreadsheetId;
  }

  async pushProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project?.spreadsheetId) return;

    const sheetLastUpdated = await googleSheetsService.getLastUpdated(project.spreadsheetId);
    const localLastSynced = project.lastSyncedAt ?? 0;

    if (localLastSynced < sheetLastUpdated) {
      // The sheet has changes we haven't seen — pull first to avoid overwriting them.
      await this.pullProject(projectId);
    }

    // Re-fetch after potential pull (project and tasks may have been updated).
    const [updatedProject, tasks, users] = await Promise.all([
      db.getById<Project>('projects', projectId),
      db.getTasksByProject(projectId),
      db.getAll<User>('users'),
    ]);

    if (!updatedProject?.spreadsheetId) return;

    await googleSheetsService.syncProject(updatedProject, tasks, users);

    // Record that the sheet is now up to date with our local state.
    const now = Date.now();
    await Promise.all([
      googleSheetsService.setLastUpdated(updatedProject.spreadsheetId, now),
      db.put('projects', { ...updatedProject, lastSyncedAt: now }),
    ]);
  }

  async pullProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project?.spreadsheetId) return;

    const remoteConfig = await googleSheetsService.pullConfig(project.spreadsheetId);
    if (remoteConfig) {
      await db.put('projects', { ...project, ...remoteConfig, spreadsheetId: project.spreadsheetId });
    }

    const remoteMembers = await googleSheetsService.pullMembers(project.spreadsheetId);
    const currentProject = await db.getById<Project>('projects', projectId);
    if (currentProject) {
      await db.put('projects', { ...currentProject, members: remoteMembers });
    }

    const [remoteTasks, remoteComments] = await Promise.all([
      googleSheetsService.pullTasks(project.spreadsheetId),
      googleSheetsService.pullComments(project.spreadsheetId),
    ]);

    for (const remoteTask of remoteTasks) {
      if (remoteTask.id) {
        const existingTask = await db.getById<Task>('tasks', remoteTask.id);
        const taskComments = remoteComments.filter((c: Comment) => c.taskId === remoteTask.id);
        await db.put('tasks', { ...existingTask, ...remoteTask, comments: taskComments } as Task);
      }
    }

    // Mark local as synced to the sheet's current timestamp so the next
    // pushProject knows it doesn't need to pull again.
    const sheetLastUpdated = await googleSheetsService.getLastUpdated(project.spreadsheetId);
    const finalProject = await db.getById<Project>('projects', projectId);
    if (finalProject) {
      await db.put('projects', { ...finalProject, lastSyncedAt: sheetLastUpdated });
    }
  }
}

export const syncService = new SyncService();
