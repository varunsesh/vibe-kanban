import { db, Project, Task, User, Comment, Release } from '../db/db';
import { googleSheetsService } from './googleSheets';

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

    // setupHeaders calls ensureRequiredSheets internally, creating lastUpdated if missing
    await googleSheetsService.setupHeaders(spreadsheetId);

    // If the linked sheet changed, reset lastSyncedAt so pushProject pulls first
    const lastSyncedAt = spreadsheetId === project.spreadsheetId ? (project.lastSyncedAt ?? 0) : 0;
    await db.put('projects', { ...project, spreadsheetId, lastSyncedAt });

    await this.pushProject(projectId);
    return spreadsheetId;
  }

  async pushProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project?.spreadsheetId) return;

    // Always ensure required sheets exist before reading/writing timestamps.
    // This handles migration from spreadsheets created before lastUpdated was introduced.
    // It's a single GET that's a no-op when all sheets already exist.
    await googleSheetsService.ensureRequiredSheets(project.spreadsheetId);

    const sheetLastUpdated = await googleSheetsService.getLastUpdated(project.spreadsheetId);
    const localLastSynced = project.lastSyncedAt ?? 0;

    if (localLastSynced < sheetLastUpdated) {
      // Sheet has changes since our last push — pull first to avoid overwriting them
      await this.pullProject(projectId);
    }

    // Re-fetch after potential pull (project and tasks may have been updated)
    const [updatedProject, tasks, users, releases] = await Promise.all([
      db.getById<Project>('projects', projectId),
      db.getTasksByProject(projectId),
      db.getAll<User>('users'),
      db.getReleasesByProject(projectId),
    ]);

    if (!updatedProject?.spreadsheetId) return;

    await googleSheetsService.syncProject(updatedProject, tasks, users, releases);

    const now = Date.now();
    await Promise.all([
      googleSheetsService.setLastUpdated(updatedProject.spreadsheetId, now),
      db.put('projects', { ...updatedProject, lastSyncedAt: now }),
    ]);
  }

  async pullProject(projectId: string) {
    const project = await db.getById<Project>('projects', projectId);
    if (!project?.spreadsheetId) return;

    // Single batchGet call instead of 4 sequential requests — avoids 429s on load
    const { config: remoteConfig, members: remoteMembers, tasks: remoteTasks, comments: remoteComments, releases: remoteReleases, users: remoteUsers } =
      await googleSheetsService.pullAllSheetData(project.spreadsheetId);

    if (remoteConfig) {
      await db.put('projects', { ...project, ...remoteConfig, spreadsheetId: project.spreadsheetId, members: remoteMembers });
    } else {
      // Always apply remote members even when config row is absent
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

    // Upsert remote users — preserves globalRole from the local record if it exists
    for (const remoteUser of remoteUsers) {
      if (!remoteUser.id) continue;
      const existing = await db.getById<User>('users', remoteUser.id);
      await db.put('users', { ...remoteUser, globalRole: existing?.globalRole ?? 'User' } as User);
    }

    // Sync releases: delete releases not in remote, upsert all remote releases
    const localReleases = await db.getReleasesByProject(projectId);
    const remoteReleaseIds = new Set(remoteReleases.map(r => r.id));
    for (const local of localReleases) {
      if (!remoteReleaseIds.has(local.id)) {
        await db.delete('releases', local.id);
      }
    }
    for (const remoteRelease of remoteReleases) {
      await db.put('releases', remoteRelease as Release);
    }
    // Note: lastSyncedAt is intentionally NOT updated here. It tracks when we last
    // pushed to the sheet, not when we last pulled. pushProject uses it to decide
    // whether the sheet has changed since our last write.
  }
}

export const syncService = new SyncService();
