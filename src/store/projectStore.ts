import { create } from 'zustand';
import { DropResult } from '@hello-pangea/dnd';
import { db, Project, Task, Release } from '../db/db';
import { syncService } from '../services/SyncService';
import { useAppStore } from './appStore';
import { useUserStore } from './userStore';

// Walk up the parent chain after a status change. When every child of a parent
// shares the same status, the parent is updated to match. Recurses to the root.
const propagateStatusUp = async (taskId: string, projectId: string): Promise<void> => {
  const task = await db.getById<Task>('tasks', taskId);
  if (!task?.parentTaskId) return;

  const all = await db.getTasksByProject(projectId);
  const siblings = all.filter(t => t.parentTaskId === task.parentTaskId);
  if (siblings.length === 0) return;

  const unanimousStatus = siblings[0].status;
  if (!siblings.every(s => s.status === unanimousStatus)) return;

  const parent = await db.getById<Task>('tasks', task.parentTaskId);
  if (!parent || parent.status === unanimousStatus) return;

  await db.put('tasks', { ...parent, status: unanimousStatus });
  await propagateStatusUp(task.parentTaskId, projectId);
};

interface ProjectState {
  projects: Project[];
  tasks: Task[];
  releases: Release[];
  activeProjectId: string | null;
  activeReleaseId: string | null;
  loadProjects: () => Promise<void>;
  loadTasks: (projectId: string) => Promise<void>;
  loadReleases: (projectId: string) => Promise<void>;
  selectProject: (projectId: string) => Promise<void>;
  selectRelease: (releaseId: string | null) => Promise<void>;
  addProject: (name: string) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  addRelease: (name: string, description?: string, scheduledDate?: number, actualDate?: number) => Promise<void>;
  updateRelease: (release: Release) => Promise<void>;
  deleteRelease: (releaseId: string) => Promise<void>;
  reorderReleases: (startIndex: number, endIndex: number) => Promise<void>;
  connectSheets: (projectId: string, spreadsheetInput?: string) => Promise<void>;
  syncFromSheets: (projectId: string) => Promise<void>;
  addColumn: () => Promise<void>;
  renameColumn: (columnId: string, newTitle: string) => Promise<void>;
  deleteColumn: (columnId: string) => Promise<void>;
  createTaskId: (projectId: string) => Promise<string>;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  moveTask: (result: DropResult) => Promise<void>;
  addComment: (taskId: string, text: string) => Promise<void>;
  addMember: (projectId: string, userId: string, role: 'Project Manager' | 'Member') => Promise<void>;
  removeMember: (projectId: string, userId: string) => Promise<void>;
  reorderTasks: (draggedId: string, targetId: string) => Promise<void>;
  linkAsSubTask: (taskId: string, parentId: string) => Promise<void>;
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
  releases: [],
  activeProjectId: null,
  activeReleaseId: null,
  loadProjects: async () => {
    const allProjects = await db.getAll<Project>('projects');
    const currentUser = useUserStore.getState().currentUser;
    
    // Filter projects based on roles/ownership
    const projects = allProjects
      .filter(p => {
        if (!currentUser) return false;
        if (currentUser.globalRole === 'Admin') return true;
        if (p.ownerId === currentUser.id) return true;
        return p.members?.some(m => m.userId === currentUser.id);
      })
      .map((project) => ({
        ...project,
        columns: project.columns || [
          { id: 'todo', title: 'To Do' },
          { id: 'inprogress', title: 'In Progress' },
          { id: 'done', title: 'Done' },
        ],
        members: project.members || [],
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
      await get().loadReleases(nextActiveProjectId);
      await get().loadTasks(nextActiveProjectId);
    } else {
      set({ tasks: [], releases: [], activeReleaseId: null });
    }
  },
  loadTasks: async (projectId: string) => {
    const { activeReleaseId } = get();
    let tasks = await db.getTasksByProject(projectId);
    if (activeReleaseId) {
      tasks = tasks.filter(t => t.releaseId === activeReleaseId);
    }
    set({ tasks });
  },
  loadReleases: async (projectId: string) => {
    const releases = await db.getReleasesByProject(projectId);
    set({ releases: releases.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) });
  },
  selectProject: async (projectId: string) => {
    set({ activeProjectId: projectId, activeReleaseId: null });
    useAppStore.getState().setActiveView('board');
    await get().loadReleases(projectId);
    await get().loadTasks(projectId);
    await syncService.pullProject(projectId).catch(() => undefined);
    await get().loadReleases(projectId);
    await get().loadTasks(projectId);
  },
  selectRelease: async (releaseId: string | null) => {
    set({ activeReleaseId: releaseId });
    const { activeProjectId } = get();
    if (activeProjectId) {
      await get().loadTasks(activeProjectId);
    }
  },
  addProject: async (name: string) => {
    const currentUser = useUserStore.getState().currentUser;
    if (!currentUser) return;

    const existingIds = new Set((await db.getAll<Project>('projects')).map((p) => p.id));
    const projectId = buildUniqueProjectId(name, existingIds);
    const newProject: Project = {
      id: projectId,
      name,
      description: '',
      ownerId: currentUser.id,
      members: [],
      columns: [
        { id: 'todo', title: 'To Do' },
        { id: 'inprogress', title: 'In Progress' },
        { id: 'done', title: 'Done' },
      ],
      createdAt: Date.now(),
    };

    await db.put('projects', newProject);
    await get().loadProjects();
    set({ activeProjectId: newProject.id, activeReleaseId: null });
    useAppStore.getState().setActiveView('board');
    await get().loadReleases(newProject.id);
    await get().loadTasks(newProject.id);
  },
  deleteProject: async (projectId: string) => {
    const { projects, activeProjectId } = get();
    const currentUser = useUserStore.getState().currentUser;
    const project = projects.find(p => p.id === projectId);
    
    // Only Admin or Owner can delete
    if (!currentUser || (currentUser.globalRole !== 'Admin' && project?.ownerId !== currentUser.id)) {
      return;
    }

    await db.deleteTasksByProject(projectId);
    await db.deleteReleasesByProject(projectId);
    await db.delete('projects', projectId);
    await get().loadProjects();

    if (activeProjectId === projectId) {
      const remainingProjects = projects.filter((project) => project.id !== projectId);
      const nextId = remainingProjects.length > 0 ? remainingProjects[0].id : null;
      set({ activeProjectId: nextId, tasks: [], releases: [], activeReleaseId: null });
      if (nextId) {
        await get().loadReleases(nextId);
        await get().loadTasks(nextId);
      }
    }
  },
  addRelease: async (name: string, description?: string, scheduledDate?: number, actualDate?: number) => {
    const { activeProjectId, releases } = get();
    if (!activeProjectId) return;

    const maxOrder = releases.reduce((max, r) => Math.max(max, r.order ?? 0), -1);

    const newRelease: Release = {
      id: Math.random().toString(36).substr(2, 9),
      projectId: activeProjectId,
      name,
      description,
      status: 'Planned',
      order: maxOrder + 1,
      scheduledDate,
      actualDate,
      createdAt: Date.now(),
    };

    await db.put('releases', newRelease);
    await get().loadReleases(activeProjectId);
    syncService.debouncedPush(activeProjectId);
  },
  updateRelease: async (release: Release) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;

    await db.put('releases', release);
    await get().loadReleases(activeProjectId);
    syncService.debouncedPush(activeProjectId);
  },
  deleteRelease: async (releaseId: string) => {
    const { activeProjectId, activeReleaseId } = get();
    if (!activeProjectId) return;

    // Unassign tasks from this release instead of deleting them
    const tasks = await db.getTasksByProject(activeProjectId);
    for (const task of tasks) {
      if (task.releaseId === releaseId) {
        await db.put('tasks', { ...task, releaseId: undefined });
      }
    }

    await db.delete('releases', releaseId);
    if (activeReleaseId === releaseId) {
      set({ activeReleaseId: null });
    }
    await get().loadReleases(activeProjectId);
    await get().loadTasks(activeProjectId);
    syncService.debouncedPush(activeProjectId);
  },
  reorderReleases: async (startIndex: number, endIndex: number) => {
    const { releases, activeProjectId } = get();
    if (!activeProjectId) return;

    const result = Array.from(releases);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);

    const updatedReleases = result.map((release, index) => ({
      ...release,
      order: index,
    }));

    set({ releases: updatedReleases });

    for (const release of updatedReleases) {
      await db.put('releases', release);
    }
    syncService.debouncedPush(activeProjectId);
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
      await syncService.forcePullProject(projectId);
      await get().loadTasks(projectId);
      await get().loadReleases(projectId);
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
    const { activeProjectId, activeReleaseId } = get();
    const currentUser = useUserStore.getState().currentUser;
    if (!currentUser) return;

    // Set createdBy for new tasks
    const existing = await db.getById<Task>('tasks', task.id);

    // Inherit releaseId from parent if not explicitly set
    let releaseId = task.releaseId || (existing ? existing.releaseId : undefined) || activeReleaseId || undefined;
    if (!releaseId && task.parentTaskId) {
      const parent = await db.getById<Task>('tasks', task.parentTaskId);
      if (parent?.releaseId) releaseId = parent.releaseId;
    }

    const taskToSave = {
      ...task,
      createdBy: existing?.createdBy || currentUser.id,
      releaseId,
    };

    await db.put('tasks', taskToSave);
    if (!activeProjectId) return;
    await propagateStatusUp(taskToSave.id, activeProjectId);
    await get().loadTasks(activeProjectId);
    syncService.debouncedPush(activeProjectId);
  },
  deleteTask: async (taskId: string) => {
    const { activeProjectId, tasks, projects } = get();
    const currentUser = useUserStore.getState().currentUser;
    if (!currentUser || !activeProjectId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const project = projects.find(p => p.id === activeProjectId);
    const userRole = project?.members.find(m => m.userId === currentUser.id)?.role;

    // Permissions: Global Admin, PM of project, or Task Creator
    const canDelete = 
      currentUser.globalRole === 'Admin' ||
      project?.ownerId === currentUser.id ||
      userRole === 'Project Manager' ||
      task.createdBy === currentUser.id;

    if (!canDelete) return;

    await db.delete('tasks', taskId);
    await get().loadTasks(activeProjectId);
    syncService.debouncedPush(activeProjectId);
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
      await propagateStatusUp(updatedTask.id, activeProjectId);
      await get().loadTasks(activeProjectId);
      syncService.debouncedPush(activeProjectId);
    }
  },
  addComment: async (taskId: string, text: string) => {
    const { activeProjectId, tasks } = get();
    const currentUser = useUserStore.getState().currentUser;
    if (!currentUser || !activeProjectId) return;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const newComment = {
      id: Math.random().toString(36).substr(2, 9),
      taskId,
      userId: currentUser.id,
      text,
      createdAt: Date.now(),
    };

    const updatedTask = {
      ...task,
      comments: [...(task.comments || []), newComment],
    };

    await db.put('tasks', updatedTask);
    await get().loadTasks(activeProjectId);
    syncService.debouncedPush(activeProjectId);
  },
  addMember: async (projectId: string, userId: string, role: 'Project Manager' | 'Member') => {
    const project = await db.getById<Project>('projects', projectId);
    if (!project) return;

    const members = [...(project.members || [])];
    const existingIndex = members.findIndex(m => m.userId === userId);
    
    if (existingIndex >= 0) {
      members[existingIndex] = { userId, role };
    } else {
      members.push({ userId, role });
    }

    await db.put('projects', { ...project, members });
    await get().loadProjects();
    syncService.debouncedPush(projectId);
  },
  reorderTasks: async (draggedId: string, targetId: string) => {
    const { activeProjectId, tasks } = get();
    if (!activeProjectId || draggedId === targetId) return;

    const dragged = tasks.find(t => t.id === draggedId);
    const target = tasks.find(t => t.id === targetId);
    if (!dragged || !target) return;

    // Only reorder within same parent
    if (dragged.parentTaskId !== target.parentTaskId) return;

    // Get siblings in current display order (sortOrder ?? createdAt)
    const siblings = tasks
      .filter(t => t.parentTaskId === dragged.parentTaskId && t.projectId === activeProjectId)
      .sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt));

    const fromIdx = siblings.findIndex(t => t.id === draggedId);
    const toIdx = siblings.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...siblings];
    const [removed] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, removed);

    const STEP = 1000;
    await Promise.all(reordered.map((t, i) => db.put('tasks', { ...t, sortOrder: i * STEP })));
    await get().loadTasks(activeProjectId);
    syncService.debouncedPush(activeProjectId);
  },
  linkAsSubTask: async (taskId: string, parentId: string) => {
    const { activeProjectId } = get();
    if (!activeProjectId) return;
    const [task, parent] = await Promise.all([
      db.getById<Task>('tasks', taskId),
      db.getById<Task>('tasks', parentId),
    ]);
    if (!task) return;
    // Inherit parent's releaseId when linking
    const releaseId = parent?.releaseId ?? task.releaseId;
    await db.put('tasks', { ...task, parentTaskId: parentId, releaseId });
    await get().loadTasks(activeProjectId);
    syncService.debouncedPush(activeProjectId);
  },
  removeMember: async (projectId: string, userId: string) => {
    const project = await db.getById<Project>('projects', projectId);
    if (!project) return;

    const members = (project.members || []).filter(m => m.userId !== userId);
    await db.put('projects', { ...project, members });
    await get().loadProjects();
    syncService.debouncedPush(projectId);
  },
}));

// Selectors for no prop-drilling
export const useProjectRole = (projectId: string | null) => {
  const currentUser = useUserStore(state => state.currentUser);
  const project = useProjectStore(state => state.projects.find(p => p.id === projectId));
  
  if (!currentUser || !project) return null;
  if (currentUser.globalRole === 'Admin' || project.ownerId === currentUser.id) return 'Project Manager';
  
  return project.members.find(m => m.userId === currentUser.id)?.role || null;
};

export const useCanEditProject = (projectId: string | null) => {
  const role = useProjectRole(projectId);
  return role === 'Project Manager';
};

export const useCanDeleteTask = (task: Task | null) => {
  const currentUser = useUserStore(state => state.currentUser);
  const role = useProjectRole(task?.projectId || null);
  
  if (!currentUser || !task) return false;
  
  return (
    currentUser.globalRole === 'Admin' ||
    role === 'Project Manager' ||
    task.createdBy === currentUser.id
  );
};
