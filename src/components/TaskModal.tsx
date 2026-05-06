import React, { useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box, Typography, Avatar
} from '@mui/material';
import { Task } from '../db/db';
import { useAppStore, buildEmptyTaskDraft } from '../store/appStore';
import { useProjectStore } from '../store/projectStore';
import { useUserStore } from '../store/userStore';

const TaskModal: React.FC = () => {
  const tasks = useProjectStore((state) => state.tasks);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const createTaskId = useProjectStore((state) => state.createTaskId);
  const saveTask = useProjectStore((state) => state.saveTask);
  const deleteTask = useProjectStore((state) => state.deleteTask);

  const users = useUserStore((state) => state.users);

  const isTaskModalOpen = useAppStore((state) => state.isTaskModalOpen);
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  const initialTaskStatus = useAppStore((state) => state.initialTaskStatus);
  const taskDraft = useAppStore((state) => state.taskDraft);
  const closeTaskModal = useAppStore((state) => state.closeTaskModal);
  const setTaskDraft = useAppStore((state) => state.setTaskDraft);
  const patchTaskDraft = useAppStore((state) => state.patchTaskDraft);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const columns = activeProject?.columns || [];

  useEffect(() => {
    if (!isTaskModalOpen) return;
    if (selectedTask) {
      setTaskDraft(selectedTask);
      return;
    }
    if (!activeProjectId) return;
    const fallbackStatus = initialTaskStatus || (columns.length > 0 ? columns[0].id : '');
    setTaskDraft(buildEmptyTaskDraft(activeProjectId, fallbackStatus));
  }, [isTaskModalOpen, selectedTaskId, activeProjectId, initialTaskStatus, columns.length, selectedTask, setTaskDraft]);

  const handleSave = async () => {
    if (!taskDraft.title) return;
    if (!activeProjectId) return;
    const id = taskDraft.id || await createTaskId(activeProjectId);
    await saveTask({
      ...taskDraft,
      id,
    } as Task);
    closeTaskModal();
  };

  const handleDelete = async () => {
    if (!selectedTask?.id) return;
    await deleteTask(selectedTask.id);
    closeTaskModal();
  };

  return (
    <Dialog open={isTaskModalOpen} onClose={closeTaskModal} maxWidth="sm" fullWidth>
      <DialogTitle>
        <TextField
          fullWidth
          variant="standard"
          placeholder="Task Title"
          value={taskDraft.title || ''}
          onChange={(event) => patchTaskDraft({ title: event.target.value })}
          sx={{ '& .MuiInput-root': { fontSize: '1.5rem', fontWeight: 600 } }}
        />
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 4, mt: 2 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Description</Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              placeholder="Add a more detailed description..."
              value={taskDraft.description || ''}
              onChange={(event) => patchTaskDraft({ description: event.target.value })}
            />
          </Box>

          <Box sx={{ width: 180 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
              DETAILS
            </Typography>

            <TextField
              select
              fullWidth
              label="Status"
              size="small"
              value={taskDraft.status || ''}
              onChange={(event) => patchTaskDraft({ status: event.target.value })}
              sx={{ mb: 2 }}
            >
              {columns.map((column) => (
                <MenuItem key={column.id} value={column.id}>{column.title}</MenuItem>
              ))}
            </TextField>

            <TextField
              select
              fullWidth
              label="Priority"
              size="small"
              value={taskDraft.priority || 'medium'}
              onChange={(event) => patchTaskDraft({ priority: event.target.value as Task['priority'] })}
              sx={{ mb: 2 }}
            >
              <MenuItem value="low">Low</MenuItem>
              <MenuItem value="medium">Medium</MenuItem>
              <MenuItem value="high">High</MenuItem>
            </TextField>

            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
              ASSIGNEE
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={taskDraft.assigneeId || ''}
              onChange={(event) => patchTaskDraft({ assigneeId: event.target.value })}
              sx={{ mb: 2 }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar src={user.photoURL} sx={{ width: 20, height: 20 }}>
                      {user.displayName[0]}
                    </Avatar>
                    <Typography variant="body2">{user.displayName}</Typography>
                  </Box>
                </MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        {selectedTask && (
          <Button color="error" onClick={() => void handleDelete()}>Delete</Button>
        )}
        <Box>
          <Button onClick={closeTaskModal} sx={{ mr: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={!taskDraft.title}>
            Save
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default TaskModal;
