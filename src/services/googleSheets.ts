import { Project, Task } from '../db/db';

const GOOGLE_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const REQUIRED_SHEETS = ['Tasks', 'Config'];

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
        sheets: [
          { properties: { title: 'Tasks' } },
          { properties: { title: 'Config' } },
        ],
      }),
    });
    return data.spreadsheetId;
  }

  async setupHeaders(spreadsheetId: string) {
    await this.ensureRequiredSheets(spreadsheetId);

    const taskHeaders = [
      ['ID', 'ProjectID', 'Title', 'Description', 'Status', 'Priority', 'DueDate', 'AssigneeId', 'CreatedAt']
    ];
    const configHeaders = [
      ['ID', 'Name', 'Description', 'ColumnsJSON', 'CreatedAt']
    ];

    await this.updateValues(spreadsheetId, 'Tasks!A1:I1', taskHeaders);
    await this.updateValues(spreadsheetId, 'Config!A1:E1', configHeaders);
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

  async syncProject(project: Project, tasks: Task[]) {
    if (!project.spreadsheetId) return;

    // Sync Config
    const configData = [[
      project.id,
      project.name,
      project.description,
      JSON.stringify(project.columns),
      project.createdAt
    ]];
    await this.updateValues(project.spreadsheetId, 'Config!A2:E2', configData);

    // Sync Tasks
    const taskData = tasks.map(task => [
      task.id,
      task.projectId,
      task.title,
      task.description,
      task.status,
      task.priority,
      task.dueDate || '',
      task.assigneeId || '',
      task.createdAt
    ]);

    // Clear existing tasks first or just overwrite. 
    // For simplicity, we'll overwrite the range.
    // In a production app, we'd manage rows more carefully.
    if (taskData.length > 0) {
      await this.updateValues(project.spreadsheetId, `Tasks!A2:I${taskData.length + 1}`, taskData);
    }
  }

  async pullTasks(spreadsheetId: string): Promise<Partial<Task>[]> {
    const url = `${GOOGLE_API_BASE}/${spreadsheetId}/values/Tasks!A2:I1000`;
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
      createdAt: Number(row[8]),
    }));
  }
}

export const googleSheetsService = new GoogleSheetsService();
