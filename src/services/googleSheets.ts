import { Project, Task, Comment, Release, User } from '../db/db';

const GOOGLE_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const REQUIRED_SHEETS = ['Tasks', 'Config', 'Members', 'Comments', 'Releases', 'Users', 'lastUpdated'];

export class GoogleSheetsService {
  private readonly tokenKey = 'googleAccessToken';

  extractSpreadsheetId(input: string): string | null {
    const trimmed = input.trim();
    if (!trimmed) return null;

    const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch?.[1]) return idMatch[1];

    if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
    return null;
  }

  private getAccessToken(): string | null {
    const sessionToken = sessionStorage.getItem(this.tokenKey);
    if (sessionToken) return sessionToken;

    const localToken = localStorage.getItem(this.tokenKey);
    if (localToken) {
      sessionStorage.setItem(this.tokenKey, localToken);
      return localToken;
    }

    const cookieToken = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${this.tokenKey}=`))
      ?.split('=')[1];

    if (cookieToken) {
      const decoded = decodeURIComponent(cookieToken);
      sessionStorage.setItem(this.tokenKey, decoded);
      localStorage.setItem(this.tokenKey, decoded);
      return decoded;
    }

    return null;
  }

  // Spreadsheet IDs whose sheets have been verified to exist this session.
  // Lets ensureRequiredSheets skip the GET after the first successful check.
  private readonly sheetsVerifiedThisSession = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async fetchGoogleApi(url: string, options: RequestInit = {}): Promise<any> {
    const token = this.getAccessToken();
    if (!token) throw new Error('No Google Access Token found');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Retry up to 3 times on 429 with exponential back-off (1 s, 2 s, 4 s).
    for (let attempt = 0; attempt < 4; attempt++) {
      const response = await fetch(url, { ...options, headers });

      if (response.status === 429 && attempt < 3) {
        const delay = 1000 * Math.pow(2, attempt);
        console.warn(`[Sheets API] 429 rate-limited — retrying in ${delay}ms (attempt ${attempt + 1})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!response.ok) {
        let errorData: Record<string, unknown> = {};
        try { errorData = await response.json() as Record<string, unknown>; } catch { /* ignore */ }
        const apiError = errorData.error as { message?: string; status?: string } | undefined;
        const message = apiError?.message ?? `HTTP ${response.status}`;
        const safeUrl = url.replace(/key=[^&]+/, 'key=…');
        console.error(`[Sheets API] ${response.status} ${options.method ?? 'GET'} ${safeUrl}`, apiError?.status, message);
        throw new Error(message);
      }

      return response.json();
    }

    throw new Error('Exceeded retry limit after repeated 429 responses');
  }

  async createSpreadsheet(projectName: string): Promise<string> {
    const data = await this.fetchGoogleApi(GOOGLE_API_BASE, {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          title: `Vibe-Kanban: ${projectName}`,
        },
        sheets: REQUIRED_SHEETS.map(title => ({ properties: { title } })),
      }),
    });
    return data.spreadsheetId;
  }

  async setupHeaders(spreadsheetId: string) {
    await this.ensureRequiredSheets(spreadsheetId);
    await this.batchUpdateValues(spreadsheetId, [
      { range: 'Tasks!A1:O1',    values: [['ID', 'ProjectID', 'Title', 'Description', 'Status', 'Priority', 'DueDate', 'AssigneeId', 'CreatedBy', 'CreatedAt', 'StartDate', 'Duration', 'Dependencies', 'ParentTaskID', 'SortOrder']] },
      { range: 'Config!A1:F1',   values: [['ID', 'Name', 'Description', 'ColumnsJSON', 'OwnerID', 'CreatedAt']] },
      { range: 'Members!A1:C1',  values: [['ProjectID', 'UserID', 'Role']] },
      { range: 'Comments!A1:F1', values: [['ID', 'TaskID', 'UserID', 'UserName', 'Text', 'CreatedAt']] },
      { range: 'Releases!A1:I1', values: [['ID', 'ProjectID', 'Name', 'Description', 'Status', 'Order', 'CreatedAt', 'ScheduledDate', 'ActualDate']] },
      { range: 'Users!A1:D1',    values: [['ID', 'DisplayName', 'Email', 'PhotoURL']] },
    ]);
  }

  async ensureRequiredSheets(spreadsheetId: string) {
    // Skip the network round-trip if already verified this session.
    if (this.sheetsVerifiedThisSession.has(spreadsheetId)) return;

    const url = `${GOOGLE_API_BASE}/${spreadsheetId}?fields=sheets(properties(title))`;
    const data = await this.fetchGoogleApi(url);
    const existing = new Set<string>(
      (data.sheets || []).map((sheet: any) => sheet.properties?.title).filter(Boolean) as string[]
    );
    const missing = REQUIRED_SHEETS.filter(sheet => !existing.has(sheet));

    if (missing.length > 0) {
      const batchUrl = `${GOOGLE_API_BASE}/${spreadsheetId}:batchUpdate`;
      await this.fetchGoogleApi(batchUrl, {
        method: 'POST',
        body: JSON.stringify({
          requests: missing.map(title => ({ addSheet: { properties: { title } } })),
        }),
      });
    }

    this.sheetsVerifiedThisSession.add(spreadsheetId);
  }

  async updateValues(spreadsheetId: string, range: string, values: any[][]) {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`;
    return this.fetchGoogleApi(url, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    });
  }

  async batchUpdateValues(spreadsheetId: string, data: { range: string; values: any[][] }[]) {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values:batchUpdate`;
    return this.fetchGoogleApi(url, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    });
  }

  async batchClearRanges(spreadsheetId: string, ranges: string[]) {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values:batchClear`;
    return this.fetchGoogleApi(url, {
      method: 'POST',
      body: JSON.stringify({ ranges }),
    });
  }

  async syncProject(project: Project, tasks: Task[], users: User[], releases: Release[] = [], lastUpdatedTs?: number) {
    if (!project.spreadsheetId) return;
    const id = project.spreadsheetId;

    // Clear all data rows in one request so deleted records don't persist
    await this.batchClearRanges(id, [
      'Tasks!A2:O100000',
      'Members!A2:C10000',
      'Comments!A2:F100000',
      'Releases!A2:I10000',
      'Users!A2:D10000',
    ]);

    const memberData = (project.members || []).map(m => [project.id, m.userId, m.role]);
    const allComments: Comment[] = tasks.flatMap(t => t.comments || []);
    const commentData = allComments.map(c => {
      const user = users.find(u => u.id === c.userId);
      return [c.id, c.taskId, c.userId, user?.displayName || 'Unknown', c.text, c.createdAt];
    });
    const userData = users.map(u => [u.id, u.displayName, u.email, u.photoURL || '']);
    const taskData = tasks.map(task => [
      task.id, task.projectId, task.title, task.description,
      task.status, task.priority, task.dueDate || '',
      task.assigneeId || '', task.createdBy, task.createdAt,
      task.startDate || '', task.duration || '',
      (task.dependencies ?? []).join(','),
      task.parentTaskId || '',
      task.sortOrder ?? '',
    ]);

    // Write all data in one batch request
    const updates: { range: string; values: any[][] }[] = [
      { range: 'Config!A2:F2', values: [[
          project.id, project.name, project.description,
          JSON.stringify(project.columns), project.ownerId, project.createdAt,
        ]] },
    ];
    const releaseData = releases.map(r => [
      r.id, r.projectId, r.name, r.description ?? '', r.status, r.order, r.createdAt,
      r.scheduledDate ?? '', r.actualDate ?? '',
    ]);

    if (memberData.length > 0)  updates.push({ range: `Members!A2:C${memberData.length + 1}`,   values: memberData });
    if (commentData.length > 0) updates.push({ range: `Comments!A2:F${commentData.length + 1}`, values: commentData });
    if (taskData.length > 0)    updates.push({ range: `Tasks!A2:O${taskData.length + 1}`,       values: taskData });
    if (releaseData.length > 0) updates.push({ range: `Releases!A2:I${releaseData.length + 1}`, values: releaseData });
    if (userData.length > 0)    updates.push({ range: `Users!A2:D${userData.length + 1}`,       values: userData });
    // Write lastUpdated in the same batch instead of a separate PUT call.
    if (lastUpdatedTs !== undefined) updates.push({ range: 'lastUpdated!A1', values: [[lastUpdatedTs]] });

    await this.batchUpdateValues(id, updates);
  }

  async pullTasks(spreadsheetId: string): Promise<Partial<Task>[]> {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/Tasks!A2:O10000`;
    const data = await this.fetchGoogleApi(url);
    const rows = data.values || [];

    return rows.map((row: any[]) => ({
      id: row[0],
      projectId: row[1],
      title: row[2],
      description: row[3],
      status: row[4],
      priority: row[5] as any,
      dueDate: row[6] ? Number(row[6]) : undefined,
      assigneeId: row[7] || undefined,
      createdBy: row[8],
      createdAt: Number(row[9]),
      startDate: row[10] ? Number(row[10]) : undefined,
      duration: row[11] ? Number(row[11]) : undefined,
      dependencies: row[12] ? String(row[12]).split(',').filter(Boolean) : [],
      parentTaskId: row[13] || undefined,
      sortOrder: row[14] !== undefined && row[14] !== '' ? Number(row[14]) : undefined,
    }));
  }

  async pullMembers(spreadsheetId: string): Promise<{ userId: string; role: string }[]> {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/Members!A2:C1000`;
    const data = await this.fetchGoogleApi(url).catch(() => ({ values: [] }));
    const rows: any[][] = data.values || [];

    return rows
      .filter(row => row[1])
      .map(row => ({ userId: row[1], role: row[2] }));
  }

  async pullComments(spreadsheetId: string): Promise<Comment[]> {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/Comments!A2:F2000`;
    const data = await this.fetchGoogleApi(url).catch(() => ({ values: [] }));
    const rows = data.values || [];

    return rows.map((row: any[]) => ({
      id: row[0],
      taskId: row[1],
      userId: row[2],
      text: row[4],
      createdAt: Number(row[5]),
    }));
  }

  // Fetches config, members, tasks, and comments in a single batchGet request
  // instead of 4 separate calls — avoids rate limiting on project load.
  async pullAllSheetData(spreadsheetId: string): Promise<{
    config: Partial<Project> | null;
    members: { userId: string; role: string }[];
    tasks: Partial<Task>[];
    comments: Comment[];
    releases: Release[];
    users: Partial<User>[];
    lastUpdatedTs: number;
  }> {
    const ranges = ['Config!A2:F2', 'Members!A2:C10000', 'Tasks!A2:O10000', 'Comments!A2:F100000', 'Releases!A2:I10000', 'Users!A2:D10000', 'lastUpdated!A1'];
    const query = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values:batchGet?${query}`;

    const data = await this.fetchGoogleApi(url).catch(() => ({ valueRanges: [] }));
    const [configRange, membersRange, tasksRange, commentsRange, releasesRange, usersRange, lastUpdatedRange] = (data.valueRanges ?? []) as { values?: any[][] }[];

    const configRow = configRange?.values?.[0];
    const config: Partial<Project> | null = configRow ? {
      id: configRow[0],
      name: configRow[1],
      description: configRow[2] ?? '',
      columns: (() => { try { return JSON.parse(configRow[3]); } catch { return []; } })(),
      ownerId: configRow[4],
      createdAt: Number(configRow[5]),
    } : null;

    const members = (membersRange?.values ?? [])
      .filter((row: any[]) => row[1])
      .map((row: any[]) => ({ userId: row[1] as string, role: row[2] as string }));

    const tasks: Partial<Task>[] = (tasksRange?.values ?? []).map((row: any[]) => ({
      id: row[0],
      projectId: row[1],
      title: row[2],
      description: row[3],
      status: row[4],
      priority: row[5] as Task['priority'],
      dueDate: row[6] ? Number(row[6]) : undefined,
      assigneeId: row[7] || undefined,
      createdBy: row[8],
      createdAt: Number(row[9]),
      startDate: row[10] ? Number(row[10]) : undefined,
      duration: row[11] ? Number(row[11]) : undefined,
      dependencies: row[12] ? String(row[12]).split(',').filter(Boolean) : [],
      parentTaskId: row[13] || undefined,
    }));

    const comments: Comment[] = (commentsRange?.values ?? []).map((row: any[]) => ({
      id: row[0],
      taskId: row[1],
      userId: row[2],
      text: row[4],
      createdAt: Number(row[5]),
    }));

    const releases: Release[] = (releasesRange?.values ?? [])
      .filter((row: any[]) => row[0])
      .map((row: any[]) => ({
        id: row[0],
        projectId: row[1],
        name: row[2],
        description: row[3] || undefined,
        status: row[4] as Release['status'],
        order: Number(row[5]),
        createdAt: Number(row[6]),
        scheduledDate: row[7] ? Number(row[7]) : undefined,
        actualDate: row[8] ? Number(row[8]) : undefined,
      }));

    const users: Partial<User>[] = (usersRange?.values ?? [])
      .filter((row: any[]) => row[0])
      .map((row: any[]) => ({
        id: row[0],
        displayName: row[1] || 'Unknown',
        email: row[2] || '',
        photoURL: row[3] || '',
      }));

    const lastUpdatedTs = lastUpdatedRange?.values?.[0]?.[0] ? Number(lastUpdatedRange.values[0][0]) : 0;

    return { config, members, tasks, comments, releases, users, lastUpdatedTs };
  }

  async getLastUpdated(spreadsheetId: string): Promise<number> {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/lastUpdated!A1`;
    const data = await this.fetchGoogleApi(url).catch(() => ({ values: [] }));
    const value = data.values?.[0]?.[0];
    return value ? Number(value) : 0;
  }

  async setLastUpdated(spreadsheetId: string, timestamp: number): Promise<void> {
    await this.updateValues(spreadsheetId, 'lastUpdated!A1', [[timestamp]]);
  }

  async pullConfig(spreadsheetId: string): Promise<any> {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/Config!A2:F2`;
    const data = await this.fetchGoogleApi(url);
    const row = data.values?.[0];
    if (!row) return null;

    return {
      id: row[0],
      name: row[1],
      description: row[2],
      columns: JSON.parse(row[3]),
      ownerId: row[4],
      createdAt: Number(row[5]),
    };
  }
}

export const googleSheetsService = new GoogleSheetsService();
