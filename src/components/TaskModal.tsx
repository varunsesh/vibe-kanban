import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box, Typography, Avatar, Tooltip, List, ListItem, ListItemAvatar, ListItemText, IconButton,
  Chip, OutlinedInput, Select, InputLabel, FormControl,
} from '@mui/material';
import { User as UserIcon, Send, MessageSquare } from 'lucide-react';
import { Task } from '../db/db';

const DAY_MS = 86_400_000;

const toDateInput = (ts?: number) =>
  ts ? new Date(ts).toISOString().split('T')[0] : '';

const fromDateInput = (s: string) =>
  s ? new Date(s).getTime() : undefined;
import { useAppStore, buildEmptyTaskDraft } from '../store/appStore';
import { useProjectStore, useCanDeleteTask, useProjectRole } from '../store/projectStore';
import { getDescendantIds } from '../utils/taskTree';
import { useUserStore } from '../store/userStore';

const TaskModal: React.FC = () => {
  const tasks = useProjectStore((state) => state.tasks);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const createTaskId = useProjectStore((state) => state.createTaskId);
  const saveTask = useProjectStore((state) => state.saveTask);
  const deleteTask = useProjectStore((state) => state.deleteTask);
  const addComment = useProjectStore((state) => state.addComment);

  const users = useUserStore((state) => state.users);
  const currentUser = useUserStore((state) => state.currentUser);

  const isTaskModalOpen = useAppStore((state) => state.isTaskModalOpen);
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  const initialTaskStatus = useAppStore((state) => state.initialTaskStatus);
  const initialParentTaskId = useAppStore((state) => state.initialParentTaskId);
  const taskDraft = useAppStore((state) => state.taskDraft);
  const closeTaskModal = useAppStore((state) => state.closeTaskModal);
  const setTaskDraft = useAppStore((state) => state.setTaskDraft);
  const patchTaskDraft = useAppStore((state) => state.patchTaskDraft);
  const openTaskModal = useAppStore((state) => state.openTaskModal);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const columns = React.useMemo(() => activeProject?.columns || [], [activeProject]);
  const releases = useProjectStore((state) => state.releases);
  
  const canDelete = useCanDeleteTask(selectedTask);
  const userRole = useProjectRole(activeProjectId);
  const canComment = !!userRole;

  const [commentText, setCommentText] = useState('');

  // Sub-tasks of the current task
  const subTasks = useMemo(
    () => tasks.filter(t => t.parentTaskId === taskDraft.id),
    [tasks, taskDraft.id]
  );

  // Tasks eligible as parent: exclude self, descendants, and tasks already parented to this task's subtree
  const eligibleParents = useMemo(() => {
    if (!taskDraft.id) return tasks.filter(t => t.projectId === activeProjectId);
    const descendants = getDescendantIds(taskDraft.id, tasks);
    return tasks.filter(t =>
      t.projectId === activeProjectId &&
      t.id !== taskDraft.id &&
      !descendants.has(t.id)
    );
  }, [tasks, activeProjectId, taskDraft.id]);

  // Other tasks in this project (for dependency picker — also exclude self and descendants)
  const otherTasks = useMemo(
    () => tasks.filter(t => t.projectId === activeProjectId && t.id !== taskDraft.id),
    [tasks, activeProjectId, taskDraft.id]
  );

  // Inferred end date
  const inferredEndDate = useMemo(() => {
    if (!taskDraft.startDate || !taskDraft.duration) return null;
    return new Date(taskDraft.startDate + taskDraft.duration * DAY_MS);
  }, [taskDraft.startDate, taskDraft.duration]);

  useEffect(() => {
    if (!isTaskModalOpen) return;
    if (selectedTask) {
      setTaskDraft(selectedTask);
      return;
    }
    if (!activeProjectId) return;
    const fallbackStatus = initialTaskStatus || (columns.length > 0 ? columns[0].id : '');
    const emptyDraft = buildEmptyTaskDraft(activeProjectId, fallbackStatus);
    setTaskDraft({ ...emptyDraft, createdBy: currentUser?.id || '', parentTaskId: initialParentTaskId || undefined });
  }, [isTaskModalOpen, selectedTaskId, activeProjectId, initialTaskStatus, initialParentTaskId, columns, selectedTask, setTaskDraft, currentUser?.id]);

  const handleSave = async () => {
    if (!taskDraft.title) return;
    if (!activeProjectId || !currentUser) return;
    const id = taskDraft.id || await createTaskId(activeProjectId);
    await saveTask({
      ...taskDraft,
      id,
      createdBy: taskDraft.createdBy || currentUser.id,
    } as Task);
    closeTaskModal();
  };

  const handleDelete = async () => {
    if (!selectedTask?.id) return;
    await deleteTask(selectedTask.id);
    closeTaskModal();
  };

  const handleAddComment = async () => {
    if (!selectedTaskId || !commentText.trim()) return;
    const text = commentText.trim();
    setCommentText('');
    await addComment(selectedTaskId, text);
  };

  const creator = users.find(u => u.id === (selectedTask?.createdBy || taskDraft.createdBy));
  const sortedComments = [...(selectedTask?.comments || [])].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <Dialog open={isTaskModalOpen} onClose={closeTaskModal} maxWidth="md" fullWidth>
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
          <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Description</Typography>
              <TextField
                fullWidth
                multiline
                rows={4}
                placeholder="Add a more detailed description..."
                value={taskDraft.description || ''}
                onChange={(event) => patchTaskDraft({ description: event.target.value })}
              />
              
              {(selectedTask || taskDraft.createdBy) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, opacity: 0.7 }}>
                  <UserIcon size={14} />
                  <Typography variant="caption">
                    Created by {creator?.displayName || (selectedTask?.createdBy || taskDraft.createdBy)}
                  </Typography>
                </Box>
              )}
            </Box>

            {selectedTask && (
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <MessageSquare size={20} />
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Comments</Typography>
                </Box>

                {canComment ? (
                  <Box sx={{ display: 'flex', gap: 1, mb: 3 }}>
                    <Avatar sx={{ width: 32, height: 32 }}>{currentUser?.displayName[0]}</Avatar>
                    <TextField
                      fullWidth
                      size="small"
                      placeholder="Write a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleAddComment();
                        }
                      }}
                    />
                    <IconButton color="primary" onClick={() => void handleAddComment()} disabled={!commentText.trim()}>
                      <Send size={20} />
                    </IconButton>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Only project members can post comments.
                  </Typography>
                )}

                <List sx={{ p: 0 }}>
                  {sortedComments.map((comment) => {
                    const commentUser = users.find(u => u.id === comment.userId);
                    return (
                      <ListItem key={comment.id} alignItems="flex-start" sx={{ px: 0, py: 1.5 }}>
                        <ListItemAvatar sx={{ minWidth: 40 }}>
                          <Avatar sx={{ width: 32, height: 32 }}>{commentUser?.displayName[0] || '?'}</Avatar>
                        </ListItemAvatar>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                {commentUser?.displayName || 'Unknown User'}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {new Date(comment.createdAt).toLocaleString()}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Typography variant="body2" color="text.primary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                              {comment.text}
                            </Typography>
                          }
                        />
                      </ListItem>
                    );
                  })}
                  {sortedComments.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      No comments yet.
                    </Typography>
                  )}
                </List>
              </Box>
            )}
          </Box>

          <Box sx={{ width: 220, flexShrink: 0 }}>
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

            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
              RELEASE
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={taskDraft.releaseId || ''}
              onChange={(event) => patchTaskDraft({ releaseId: event.target.value })}
              sx={{ mb: 2 }}
            >
              <MenuItem value="">No Release</MenuItem>
              {releases.map((release) => (
                <MenuItem key={release.id} value={release.id}>
                  {release.name}
                </MenuItem>
              ))}
            </TextField>

            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
              PARENT TASK
            </Typography>
            <TextField
              select
              fullWidth
              size="small"
              value={taskDraft.parentTaskId || ''}
              onChange={(e) => patchTaskDraft({ parentTaskId: e.target.value || undefined })}
              sx={{ mb: 2 }}
            >
              <MenuItem value="">No parent (root task)</MenuItem>
              {eligibleParents.map(t => (
                <MenuItem key={t.id} value={t.id}>
                  <Typography variant="body2" noWrap>{t.title}</Typography>
                </MenuItem>
              ))}
            </TextField>

            {subTasks.length > 0 && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
                  SUB-TASKS ({subTasks.length})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
                  {subTasks.map(st => (
                    <Box
                      key={st.id}
                      onClick={() => { closeTaskModal(); setTimeout(() => openTaskModal(st.id), 50); }}
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                        borderRadius: 1, border: '1px solid #e0e0e0', cursor: 'pointer',
                        '&:hover': { bgcolor: '#f0f4ff' },
                      }}
                    >
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: st.status === 'done' ? 'success.main' : 'primary.main', flexShrink: 0 }} />
                      <Typography variant="body2" noWrap sx={{ flex: 1 }}>{st.title}</Typography>
                      <Chip label={st.priority} size="small" sx={{ fontSize: '0.6rem' }} />
                    </Box>
                  ))}
                </Box>
              </>
            )}

            {taskDraft.id && (
              <Button
                size="small"
                variant="outlined"
                fullWidth
                sx={{ mb: 2, textTransform: 'none' }}
                onClick={async () => {
                  if (!taskDraft.title) return;
                  const id = taskDraft.id || await createTaskId(activeProjectId!);
                  await saveTask({ ...taskDraft, id, createdBy: taskDraft.createdBy || currentUser?.id || '' } as Task);
                  closeTaskModal();
                  setTimeout(() => openTaskModal(null, taskDraft.status, id), 50);
                }}
              >
                + Add Sub-task
              </Button>
            )}

            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
              SCHEDULE
            </Typography>
            <TextField
              fullWidth
              type="date"
              label="Start Date"
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              value={toDateInput(taskDraft.startDate)}
              onChange={(e) => {
                const startDate = fromDateInput(e.target.value);
                const dueDate = startDate && taskDraft.duration
                  ? startDate + taskDraft.duration * DAY_MS
                  : taskDraft.dueDate;
                patchTaskDraft({ startDate, dueDate });
              }}
              sx={{ mb: 1.5 }}
            />
            <TextField
              fullWidth
              type="number"
              label="Duration (days)"
              size="small"
              slotProps={{ htmlInput: { min: 1 } }}
              value={taskDraft.duration ?? ''}
              onChange={(e) => {
                const duration = e.target.value ? Number(e.target.value) : undefined;
                const dueDate = taskDraft.startDate && duration
                  ? taskDraft.startDate + duration * DAY_MS
                  : taskDraft.dueDate;
                patchTaskDraft({ duration, dueDate });
              }}
              sx={{ mb: 1 }}
            />
            {inferredEndDate && (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                End: {inferredEndDate.toLocaleDateString()}
              </Typography>
            )}

            {otherTasks.length > 0 && (
              <>
                <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
                  DEPENDS ON
                </Typography>
                <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                  <InputLabel>Predecessors</InputLabel>
                  <Select
                    multiple
                    value={taskDraft.dependencies ?? []}
                    onChange={(e) => {
                      const val = e.target.value as string[];
                      // "none" clears all selections
                      if (val.includes('__none__')) {
                        patchTaskDraft({ dependencies: [] });
                      } else {
                        patchTaskDraft({ dependencies: val });
                      }
                    }}
                    input={<OutlinedInput label="Predecessors" />}
                    renderValue={(selected) => {
                      const ids = selected as string[];
                      if (ids.length === 0) return <Typography variant="body2" color="text.disabled">None</Typography>;
                      return (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {ids.map(id => {
                            const t = otherTasks.find(x => x.id === id);
                            return (
                              <Chip
                                key={id}
                                label={t?.title ?? id}
                                size="small"
                                onDelete={(e) => {
                                  e.stopPropagation();
                                  patchTaskDraft({ dependencies: (taskDraft.dependencies ?? []).filter(d => d !== id) });
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            );
                          })}
                        </Box>
                      );
                    }}
                  >
                    <MenuItem value="__none__">
                      <Typography variant="body2" color="text.secondary">None (clear all)</Typography>
                    </MenuItem>
                    {otherTasks.map(t => (
                      <MenuItem key={t.id} value={t.id}>
                        <Typography variant="body2" noWrap>{t.title}</Typography>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
        {selectedTask && (
          <Tooltip title={!canDelete ? "You don't have permission to delete this task" : ""}>
            <span>
              <Button 
                color="error" 
                onClick={() => void handleDelete()}
                disabled={!canDelete}
              >
                Delete
              </Button>
            </span>
          </Tooltip>
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
