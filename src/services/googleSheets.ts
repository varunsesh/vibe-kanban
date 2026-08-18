import { Project, Task, Comment } from '../db/db';

const GOOGLE_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const REQUIRED_SHEETS = ['Tasks', 'Config', 'Members', 'Comments'];

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

  private async fetchGoogleApi(url: string, options: RequestInit = {}) {
    const token = this.getAccessToken();
    if (!token) throw new Error('No Google Access Token found');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Google API Error');
    }
    return response.json();
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
      { range: 'Tasks!A1:J1',    values: [['ID', 'ProjectID', 'Title', 'Description', 'Status', 'Priority', 'DueDate', 'AssigneeId', 'CreatedBy', 'CreatedAt']] },
      { range: 'Config!A1:F1',   values: [['ID', 'Name', 'Description', 'ColumnsJSON', 'OwnerID', 'CreatedAt']] },
      { range: 'Members!A1:C1',  values: [['ProjectID', 'UserID', 'Role']] },
      { range: 'Comments!A1:F1', values: [['ID', 'TaskID', 'UserID', 'UserName', 'Text', 'CreatedAt']] },
    ]);
  }

  private async ensureRequiredSheets(spreadsheetId: string) {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}?fields=sheets(properties(title))`;
    const data = await this.fetchGoogleApi(url);
    const existing = new Set<string>(
      (data.sheets || []).map((sheet: any) => sheet.properties?.title).filter(Boolean)
    );
    const missing = REQUIRED_SHEETS.filter((sheet) => !existing.has(sheet));

    if (missing.length === 0) return;

    const batchUrl = `${GOOGLE_API_BASE}/${spreadsheetId}:batchUpdate`;
    await this.fetchGoogleApi(batchUrl, {
      method: 'POST',
      body: JSON.stringify({
        requests: missing.map((title) => ({
          addSheet: { properties: { title } },
        })),
      }),
    });
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

  async syncProject(project: Project, tasks: Task[], users: any[]) {
    if (!project.spreadsheetId) return;
    const id = project.spreadsheetId;

    // Clear all data rows in one request so deleted records don't persist
    await this.batchClearRanges(id, [
      'Tasks!A2:J100000',
      'Members!A2:C10000',
      'Comments!A2:F100000',
    ]);

    const memberData = (project.members || []).map(m => [project.id, m.userId, m.role]);
    const allComments: Comment[] = tasks.flatMap(t => t.comments || []);
    const commentData = allComments.map(c => {
      const user = users.find((u: { id: string; displayName: string }) => u.id === c.userId);
      return [c.id, c.taskId, c.userId, user?.displayName || 'Unknown', c.text, c.createdAt];
    });
    const taskData = tasks.map(task => [
      task.id, task.projectId, task.title, task.description,
      task.status, task.priority, task.dueDate || '',
      task.assigneeId || '', task.createdBy, task.createdAt,
    ]);

    // Write all data in one batch request
    const updates: { range: string; values: any[][] }[] = [
      { range: 'Config!A2:F2', values: [[
          project.id, project.name, project.description,
          JSON.stringify(project.columns), project.ownerId, project.createdAt,
        ]] },
    ];
    if (memberData.length > 0)  updates.push({ range: `Members!A2:C${memberData.length + 1}`,   values: memberData });
    if (commentData.length > 0) updates.push({ range: `Comments!A2:F${commentData.length + 1}`, values: commentData });
    if (taskData.length > 0)    updates.push({ range: `Tasks!A2:J${taskData.length + 1}`,       values: taskData });

    await this.batchUpdateValues(id, updates);
  }

  async pullTasks(spreadsheetId: string): Promise<Partial<Task>[]> {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/Tasks!A2:J1000`;
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
      assigneeId: row[7],
      createdBy: row[8],
      createdAt: Number(row[9]),
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
