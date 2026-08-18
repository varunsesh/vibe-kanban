import { create } from 'zustand';
import { Task } from '../db/db';

type ActiveView = 'board' | 'settings' | 'projectSettings';

interface AppState {
  activeView: ActiveView;
  isSyncing: boolean;
  sheetLinkInput: string;
  isTaskModalOpen: boolean;
  selectedTaskId: string | null;
  initialTaskStatus: string | null;
  columnEditingId: string | null;
  columnTitleDraft: string;
  sidebarOpen: boolean;
  addProjectDialogOpen: boolean;
  newProjectName: string;
  projectToDeleteId: string | null;
  taskDraft: Partial<Task>;
  sidebarWidth: number;
  setActiveView: (view: ActiveView) => void;
  setSyncing: (syncing: boolean) => void;
  setSheetLinkInput: (value: string) => void;
  openTaskModal: (taskId: string | null, initialStatus?: string) => void;
  closeTaskModal: () => void;
  startColumnRename: (columnId: string, currentTitle: string) => void;
  setColumnTitleDraft: (value: string) => void;
  stopColumnRename: () => void;
  setSidebarOpen: (value: boolean) => void;
  setSidebarWidth: (value: number) => void;
  setAddProjectDialogOpen: (value: boolean) => void;
  setNewProjectName: (value: string) => void;
  setProjectToDeleteId: (value: string | null) => void;
  setTaskDraft: (value: Partial<Task>) => void;
  patchTaskDraft: (value: Partial<Task>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeView: 'board',
  isSyncing: false,
  sheetLinkInput: '',
  isTaskModalOpen: false,
  selectedTaskId: null,
  initialTaskStatus: null,
  columnEditingId: null,
  columnTitleDraft: '',
  sidebarOpen: true,
  addProjectDialogOpen: false,
  newProjectName: '',
  projectToDeleteId: null,
  taskDraft: {},
  sidebarWidth: 260,
  setActiveView: (activeView) => set({ activeView }),
  setSyncing: (isSyncing) => set({ isSyncing }),
  setSheetLinkInput: (sheetLinkInput) => set({ sheetLinkInput }),
  openTaskModal: (selectedTaskId, initialStatus) =>
    set({
      isTaskModalOpen: true,
      selectedTaskId,
      initialTaskStatus: initialStatus || null,
    }),
  closeTaskModal: () =>
    set({
      isTaskModalOpen: false,
      selectedTaskId: null,
      initialTaskStatus: null,
    }),
  startColumnRename: (columnEditingId, columnTitleDraft) =>
    set({ columnEditingId, columnTitleDraft }),
  setColumnTitleDraft: (columnTitleDraft) => set({ columnTitleDraft }),
  stopColumnRename: () => set({ columnEditingId: null, columnTitleDraft: '' }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
  setAddProjectDialogOpen: (addProjectDialogOpen) => set({ addProjectDialogOpen }),
  setNewProjectName: (newProjectName) => set({ newProjectName }),
  setProjectToDeleteId: (projectToDeleteId) => set({ projectToDeleteId }),
  setTaskDraft: (taskDraft) => set({ taskDraft }),
  patchTaskDraft: (value) => set((state) => ({ taskDraft: { ...state.taskDraft, ...value } })),
}));

export const buildEmptyTaskDraft = (projectId: string, status: string): Partial<Task> => ({
  projectId,
  title: '',
  description: '',
  status,
  priority: 'medium',
  createdAt: Date.now(),
  assigneeId: '',
});
