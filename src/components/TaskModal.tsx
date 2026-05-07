import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Box, Typography, Avatar, Tooltip, Divider, List, ListItem, ListItemAvatar, ListItemText, IconButton
} from '@mui/material';
import { User as UserIcon, Send, MessageSquare } from 'lucide-react';
import { Task, Comment } from '../db/db';
import { useAppStore, buildEmptyTaskDraft } from '../store/appStore';
import { useProjectStore, useCanDeleteTask, useProjectRole } from '../store/projectStore';
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
  const taskDraft = useAppStore((state) => state.taskDraft);
  const closeTaskModal = useAppStore((state) => state.closeTaskModal);
  const setTaskDraft = useAppStore((state) => state.setTaskDraft);
  const patchTaskDraft = useAppStore((state) => state.patchTaskDraft);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) || null;
  const columns = activeProject?.columns || [];
  
  const canDelete = useCanDeleteTask(selectedTask);
  const userRole = useProjectRole(activeProjectId);
  const canComment = !!userRole;

  const [commentText, setCommentText] = useState('');

  useEffect(() => {
    if (!isTaskModalOpen) return;
    if (selectedTask) {
      setTaskDraft(selectedTask);
      return;
    }
    if (!activeProjectId) return;
    const fallbackStatus = initialTaskStatus || (columns.length > 0 ? columns[0].id : '');
    const emptyDraft = buildEmptyTaskDraft(activeProjectId, fallbackStatus);
    setTaskDraft({ ...emptyDraft, createdBy: currentUser?.id || '' });
  }, [isTaskModalOpen, selectedTaskId, activeProjectId, initialTaskStatus, columns.length, selectedTask, setTaskDraft, currentUser?.id]);

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
