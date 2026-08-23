export interface User {
  id: string;
  displayName: string;
  email: string;
  photoURL: string;
  globalRole?: 'Admin' | 'User';
}

export interface ProjectMember {
  userId: string;
  role: 'Project Manager' | 'Member';
}

export interface ColumnData {
  id: string;
  title: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  columns: ColumnData[];
  spreadsheetId?: string;
  lastSyncedAt?: number; // timestamp of last successful push to the linked sheet (per device)
  ownerId: string;
  members: ProjectMember[];
  createdAt: number;
}

export interface Comment {
  id: string;
  taskId: string;
  userId: string;
  text: string;
  createdAt: number;
}

export interface Release {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  status: 'Planned' | 'In Progress' | 'Released' | 'Archived';
  order: number;
  createdAt: number;
}

export interface Task {
  id: string;
  projectId: string;
  releaseId?: string;
  title: string;
  description: string;
  status: string; // Changed from enum to string to support dynamic columns
  priority: 'low' | 'medium' | 'high';
  parentTaskId?: string;   // ID of the parent task; undefined = root task
  startDate?: number;      // ms timestamp — when work begins
  duration?: number;       // working days
  dueDate?: number;        // derived: startDate + duration * 86400000; also writable as standalone deadline
  dependencies?: string[]; // task IDs that must finish before this task can start
  assigneeId?: string;
  createdBy: string;
  createdAt: number;
  comments?: Comment[];
}

const DB_NAME = 'KanbanDB';
const DB_VERSION = 2;

export class Database {
  private db: IDBDatabase | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('tasks')) {
          const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
          taskStore.createIndex('projectId', 'projectId', { unique: false });
          taskStore.createIndex('releaseId', 'releaseId', { unique: false });
        }

        if (!db.objectStoreNames.contains('users')) {
          db.createObjectStore('users', { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains('releases')) {
          const releaseStore = db.createObjectStore('releases', { keyPath: 'id' });
          releaseStore.createIndex('projectId', 'projectId', { unique: false });
        }
      };
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getById<T>(storeName: string, id: string): Promise<T | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, item: T): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getTasksByProject(projectId: string): Promise<Task[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('tasks', 'readonly');
      const store = transaction.objectStore('tasks');
      const index = store.index('projectId');
      const request = index.getAll(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getReleasesByProject(projectId: string): Promise<Release[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('releases', 'readonly');
      const store = transaction.objectStore('releases');
      const index = store.index('projectId');
      const request = index.getAll(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteTasksByProject(projectId: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('tasks', 'readwrite');
      const store = transaction.objectStore('tasks');
      const index = store.index('projectId');
      const request = index.openCursor(IDBKeyRange.only(projectId));

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async deleteReleasesByProject(projectId: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('releases', 'readwrite');
      const store = transaction.objectStore('releases');
      const index = store.index('projectId');
      const request = index.openCursor(IDBKeyRange.only(projectId));

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

export const db = new Database();
