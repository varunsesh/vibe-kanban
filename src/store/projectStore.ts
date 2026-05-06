import { create } from 'zustand';
import { DropResult } from '@hello-pangea/dnd';
import { db, Project, Task } from '../db/db';
import { syncService } from '../services/SyncService';
import { useAppStore } from './appStore';

interface ProjectState {
  projects: Project[];
  tasks: Task[];
  activeProjectId: string | null;
  loadProjects: () => Promise<void>;
  loadTasks: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  addProject: (name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  connectSheets: (projectId: string, spreadsheetInput?: string) => Promise<void>;
  syncFromSheets: (projectId: string) => Promise<void>;
  addColumn: () => Promise<void>;
  renameColumn: (columnId: string, newTitle: string) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
  createTaskId: (projectId: string) => Promise<string>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (result: DropResult) => Promise<void>;
}

const sanitizeProjectName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const buildUniqueProjectId = (projectName: string, existingProjectIds: Set<string>) => {
  const sanitized = sanitizeProjectName(projectName);
  const base = sanitized || 'proj';
  const minLen = Math.max(3, Math.min(3, base.length));

  // Start with 3 chars (or padded) and extend by 1 for conflicts.
  let prefix = base.slice(0, Math.max(3, minLen));
  while (prefix.length < 3) prefix += 'x';

  for (let len = prefix.length; len <= base.length; len += 1) {
    const candidate = base.slice(0, len);
    if (!existingProjectIds.has(candidate)) return candidate;
  }

  // If the name is identical and still conflicts, add a numeric suffix.
  let n = 2;
  while (existingProjectIds.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  tasks: [],
  activeProjectId: null,
  loadProjects: async () => {
    const allProjects = await db.getAll<Project>('projects');
    const projects = allProjects.map((project) => ({
      ...project,
      columns: project.columns || [
        { id: 'todo', title: 'To Do' },
        { id: 'inprogress', title: 'In Progress' },
        { id: 'done', title: 'Done' },
      ],
    }));

    const { activeProjectId } = get();
    let nextActiveProjectId = activeProjectId;
    if (projects.length === 0) {
      nextActiveProjectId = null;
    } else if (!activeProjectId || !projects.some((project) => project.id === activeProjectId)) {
      nextActiveProjectId = projects[0].id;
    }

    set({ projects, activeProjectId: nextActiveProjectId });
    if (nextActiveProjectId) {
      const tasks = await db.getTasksByProject(nextActiveProjectId);
      set({ tasks });
    } else {
      set({ tasks: [] });
    }
  },
  loadTasks: async (projectId: string) => {
    const tasks = await db.getTasksByProject(projectId);
    set({ tasks });
  },
  selectProject: async (projectId: string) => {
    set({ activeProjectId: projectId });
    useAppStore.getState().setActiveView('board');
    await get().loadTasks(projectId);
    await syncService.pullProject(projectId).catch(() => undefined);
    await get().loadTasks(projectId);
  },
  addProject: async (name: string) => {
    const existingIds = new Set((await db.getAll<Project>('projects')).map((p) => p.id));
    const projectId = buildUniqueProjectId(name, existingIds);
    const newProject: Project = {
      id: projectId,
      name,
      description: '',
      columns: [
        { id: 'todo', title: 'To Do' },
        { id: 'inprogress', title: 'In Progress' },
        { id: 'done', title: 'Done' },
      ],
      createdAt: Date.now(),
    };

    await db.put('projects', newProject);
    await get().loadProjects();
    set({ activeProjectId: newProject.id });
    useAppStore.getState().setActiveView('board');
    await get().loadTasks(newProject.id);
  },
  deleteProject: async (projectId: string) => {
    const { projects, activeProjectId } = get();
    await db.deleteTasksByProject(projectId);
    await db.delete('projects', projectId);
    await get().loadProjects();

    if (activeProjectId === projectId) {
      const remainingProjects = projects.filter((project) => project.id !== projectId);
      const nextId = remainingProjects.length > 0 ? remainingProjects[0].id : null;
      set({ activeProjectId: nextId, tasks: [] });
      if (nextId) await get().loadTasks(nextId);
    }
  },
  connectSheets: async (projectId: string, spreadsheetInput?: string) => {
    const appStore = useAppStore.getState();
    appStore.setSyncing(true);
    try {
      await syncService.connectProjectToSheets(projectId, spreadsheetInput);
      await get().loadProjects();
      const activeProject = get().projects.find((project) => project.id === get().activeProjectId);
      appStore.setSheetLinkInput(
        activeProject?.spreadsheetId
          ? `https://docs.google.com/spreadsheets/d/${activeProject.spreadsheetId}`
          : ''
      );
    } finally {
      appStore.setSyncing(false);
    }
  },
  syncFromSheets: async (projectId: string) => {
    const appStore = useAppStore.getState();
    appStore.setSyncing(true);
    try {
      await syncService.pullProject(projectId);
      await get().loadTasks(projectId);
    } finally {
      appStore.setSyncing(false);
    }
  },
  addColumn: async () => {
    const { activeProjectId, projects } = get();
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) return;

    const newColumn = { id: Math.random().toString(36).substr(2, 9), title: 'New Column' };
    await db.put('projects', { ...project, columns: [...project.columns, newColumn] });
    await get().loadProjects();
  },
  renameColumn: async (columnId: string, newTitle: string) => {
    const { activeProjectId, projects } = get();
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) return;

    const columns = project.columns.map((column) =>
      column.id === columnId ? { ...column, title: newTitle } : column
    );
    await db.put('projects', { ...project, columns });
    await get().loadProjects();
  },
  deleteColumn: async (columnId: string) => {
    const { activeProjectId, projects } = get();
    const project = projects.find((item) => item.id === activeProjectId);
    if (!project) return;

    const columns = project.columns.filter((column) => column.id !== columnId);
    await db.put('projects', { ...project, columns });
    await get().loadProjects();
  },
  createTaskId: async (projectId: string) => {
    const tasks = await db.getTasksByProject(projectId);
    const re = new RegExp(`^${escapeRegExp(projectId)}(\\d{4,})$`);
    let max = 0;
    for (const task of tasks) {
      const match = task.id.match(re);
      if (!match?.[1]) continue;
      const n = Number(match[1]);
      if (!Number.isFinite(n)) continue;
      if (n > max) max = n;
    }
    const next = max + 1;
    const suffix = String(next).padStart(4, '0');
    return `${projectId}${suffix}`;
  },
  saveTask: async (task: Task) => {
    const { activeProjectId } = get();
    await db.put('tasks', task);
    if (!activeProjectId) return;
    await get().loadTasks(activeProjectId);
    await syncService.pushProject(activeProjectId);
  },
  deleteTask: async (taskId: string) => {
    const { activeProjectId } = get();
    await db.delete('tasks', taskId);
    if (!activeProjectId) return;
    await get().loadTasks(activeProjectId);
    await syncService.pushProject(activeProjectId);
  },
  moveTask: async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const { tasks, activeProjectId } = get();
    const task = tasks.find((item) => item.id === draggableId);
    if (!task) return;

    const updatedTask = { ...task, status: destination.droppableId };
    set({ tasks: tasks.map((item) => (item.id === draggableId ? updatedTask : item)) });
    await db.put('tasks', updatedTask);

    if (activeProjectId) {
      await syncService.pushProject(activeProjectId);
    }
  },
}));
