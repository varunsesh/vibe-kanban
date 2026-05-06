import { db, Project, Task } from '../db/db';
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
    await googleSheetsService.syncProject(updatedProject, tasks);

    return spreadsheetId;
  }

  async pushProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    const tasks = await db.getTasksByProject(projectId);

    if (project && project.spreadsheetId) {
      await googleSheetsService.syncProject(project, tasks);
    }
  }

  async pullProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project || !project.spreadsheetId) return;

    const remoteTasks = await googleSheetsService.pullTasks(project.spreadsheetId);
    
    // Simple merge: remote wins for simplicity in this MVP
    for (const remoteTask of remoteTasks) {
      if (remoteTask.id) {
        const existingTask = await db.getById<Task>('tasks', remoteTask.id);
        const mergedTask = { ...existingTask, ...remoteTask } as Task;
        await db.put('tasks', mergedTask);
      }
    }
  }
}

export const syncService = new SyncService();
