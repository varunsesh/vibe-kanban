import { db, Project, Task, User, Comment, Release } from '../db/db';
import { googleSheetsService } from './googleSheets';

type SheetData = Awaited<ReturnType<typeof googleSheetsService.pullAllSheetData>>;

export class SyncService {
  private readonly pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  debouncedPush(projectId: string, delayMs = 3000) {
    const existing = this.pushTimers.get(projectId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.pushTimers.delete(projectId);
      this.pushProject(projectId).catch(console.error);
    }, delayMs);
    this.pushTimers.set(projectId, timer);
  }

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

    // setupHeaders calls ensureRequiredSheets (which also populates the session cache)
    await googleSheetsService.setupHeaders(spreadsheetId);

    const lastSyncedAt = spreadsheetId === project.spreadsheetId ? (project.lastSyncedAt ?? 0) : 0;
    await db.put('projects', { ...project, spreadsheetId, lastSyncedAt });

    await this.pushProject(projectId);
    return spreadsheetId;
  }

  async pushProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project?.spreadsheetId) return;

    // Ensure sheets exist (no-op after first call this session due to in-memory cache).
    await googleSheetsService.ensureRequiredSheets(project.spreadsheetId);

    // One batchGet for lastUpdated timestamp + all sheet data.
    // If the sheet is ahead of our last push, apply remote data first before writing.
    const sheetData = await googleSheetsService.pullAllSheetData(project.spreadsheetId);
    const localLastSynced = project.lastSyncedAt ?? 0;

    if (localLastSynced < sheetData.lastUpdatedTs) {
      await this.applySheetData(projectId, project, sheetData);
    }

    // Re-read from local DB (may have been updated by applySheetData above)
    const [updatedProject, tasks, users, releases] = await Promise.all([
      db.getById<Project>('projects', projectId),
      db.getTasksByProject(projectId),
      db.getAll<User>('users'),
      db.getReleasesByProject(projectId),
    ]);

    if (!updatedProject?.spreadsheetId) return;

    const now = Date.now();
    // syncProject writes lastUpdated inside the same batchUpdate — no separate PUT needed.
    await googleSheetsService.syncProject(updatedProject, tasks, users, releases, now);
    await db.put('projects', { ...updatedProject, lastSyncedAt: now });
  }

  async pullProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project?.spreadsheetId) return;

    const sheetData = await googleSheetsService.pullAllSheetData(project.spreadsheetId);
    await this.applySheetData(projectId, project, sheetData);
  }

  // Applies already-fetched sheet data to the local IndexedDB.
  // Shared between pullProject and the "pull before push" path in pushProject
  // so we never fetch the same data twice.
  private async applySheetData(projectId: string, project: Project, data: SheetData) {
    const { config: remoteConfig, members: remoteMembers, tasks: remoteTasks, comments: remoteComments, releases: remoteReleases, users: remoteUsers } = data;

    if (remoteConfig) {
      await db.put('projects', { ...project, ...remoteConfig, spreadsheetId: project.spreadsheetId, members: remoteMembers });
    } else {
      const currentProject = await db.getById<Project>('projects', projectId);
      if (currentProject) {
        await db.put('projects', { ...currentProject, members: remoteMembers });
      }
    }

    for (const remoteTask of remoteTasks) {
      if (remoteTask.id) {
        const existingTask = await db.getById<Task>('tasks', remoteTask.id);
        const taskComments = remoteComments.filter((c: Comment) => c.taskId === remoteTask.id);
        await db.put('tasks', { ...existingTask, ...remoteTask, comments: taskComments } as Task);
      }
    }

    for (const remoteUser of remoteUsers) {
      if (!remoteUser.id) continue;
      const existing = await db.getById<User>('users', remoteUser.id);
      await db.put('users', { ...remoteUser, globalRole: existing?.globalRole ?? 'User' } as User);
    }

    const localReleases = await db.getReleasesByProject(projectId);
    const remoteReleaseIds = new Set(remoteReleases.map(r => r.id));
    for (const local of localReleases) {
      if (!remoteReleaseIds.has(local.id)) await db.delete('releases', local.id);
    }
    for (const remoteRelease of remoteReleases) {
      await db.put('releases', remoteRelease as Release);
    }
  }
}

export const syncService = new SyncService();
