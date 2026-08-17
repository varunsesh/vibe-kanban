import { db, Project, Task, User } from '../db/db';
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

    const updatedProject = { ...project, spreadsheetId };
    await db.put('projects', updatedProject);

    // Initial push of all tasks
    const tasks = await db.getTasksByProject(projectId);
    const users = await db.getAll<User>('users');
    await googleSheetsService.syncProject(updatedProject, tasks, users);

    return spreadsheetId;
  }

  async pushProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    const tasks = await db.getTasksByProject(projectId);
    const users = await db.getAll<User>('users');

    if (project && project.spreadsheetId) {
      await googleSheetsService.syncProject(project, tasks, users);
    }
  }

  async pullProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project || !project.spreadsheetId) return;

    // Pull and update Config
    const remoteConfig = await googleSheetsService.pullConfig(project.spreadsheetId);
    if (remoteConfig) {
      const updatedProject = { ...project, ...remoteConfig };
      await db.put('projects', updatedProject);
    }

    // Pull and update Members
    const remoteMembers = await googleSheetsService.pullMembers(project.spreadsheetId);
    if (remoteMembers.length > 0) {
      const currentProject = await db.getById<Project>('projects', projectId);
      if (currentProject) {
        await db.put('projects', { ...currentProject, members: remoteMembers });
      }
    }

    const remoteTasks = await googleSheetsService.pullTasks(project.spreadsheetId);
    const remoteComments = await googleSheetsService.pullComments(project.spreadsheetId);
    
    // Simple merge: remote wins for simplicity in this MVP
    for (const remoteTask of remoteTasks) {
      if (remoteTask.id) {
        const existingTask = await db.getById<Task>('tasks', remoteTask.id);
        const taskComments = remoteComments.filter(c => c.taskId === remoteTask.id);
        const mergedTask = { ...existingTask, ...remoteTask, comments: taskComments } as Task;
        await db.put('tasks', mergedTask);
      }
    }
  }
}

export const syncService = new SyncService();
