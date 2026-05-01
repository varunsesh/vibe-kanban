import React, { useState, useEffect } from 'react';
import { 
  Dialog, DialogTitle, DialogContent, DialogActions, 
  Button, TextField, MenuItem, Box, Typography, Avatar
} from '@mui/material';
import { Task, User } from '../db/db';

interface TaskModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  onDelete: (id: string) => void;
  projectId: string;
  users: User[];
  columns: { id: string, title: string }[];
  initialStatus?: string;
}

const TaskModal: React.FC<TaskModalProps> = ({ 
  task, open, onClose, onSave, onDelete, projectId, users, columns, initialStatus 
}) => {
  const [editedTask, setEditedTask] = useState<Partial<Task>>({});

  useEffect(() => {
    if (task) {
      setEditedTask(task);
    } else {
      setEditedTask({
        projectId,
        title: '',
        description: '',
        status: initialStatus || (columns.length > 0 ? columns[0].id : ''),
        priority: 'medium',
        createdAt: Date.now(),
        assigneeId: ''
      });
    }
  }, [task, open, projectId, initialStatus, columns]);

  const handleSave = () => {
    if (editedTask.title) {
      onSave({
        ...editedTask,
        id: editedTask.id || Math.random().toString(36).substr(2, 9),
      } as Task);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <TextField
          fullWidth
          variant="standard"
          placeholder="Task Title"
          value={editedTask.title || ''}
          onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
          sx={{ '& .MuiInput-root': { fontSize: '1.5rem', fontWeight: 600 } }}
        />
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', gap: 4, mt: 2 }}>
          {/* Main Content */}
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              Description
            </Typography>
            <TextField
              fullWidth
              multiline
              rows={4}
              placeholder="Add a more detailed description..."
              value={editedTask.description || ''}
              onChange={(e) => setEditedTask({ ...editedTask, description: e.target.value })}
            />
          </Box>

          {/* Sidebar */}
          <Box sx={{ width: 180 }}>
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 1 }}>
              DETAILS
            </Typography>
            
            <TextField
              select
              fullWidth
              label="Status"
              size="small"
              value={editedTask.status || ''}
              onChange={(e) => setEditedTask({ ...editedTask, status: e.target.value })}
              sx={{ mb: 2 }}
            >
              {columns.map(col => (
                <MenuItem key={col.id} value={col.id}>{col.title}</MenuItem>
              ))}
            </TextField>

            <TextField
              select
              fullWidth
              label="Priority"
              size="small"
              value={editedTask.priority || 'medium'}
              onChange={(e) => setEditedTask({ ...editedTask, priority: e.target.value as Task['priority'] })}
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
              value={editedTask.assigneeId || ''}
              onChange={(e) => setEditedTask({ ...editedTask, assigneeId: e.target.value })}
              sx={{ mb: 2 }}
            >
              <MenuItem value="">Unassigned</MenuItem>
              {users.map(user => (
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
        {task && (
          <Button color="error" onClick={() => onDelete(task.id)}>Delete</Button>
        )}
        <Box>
          <Button onClick={onClose} sx={{ mr: 1 }}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={!editedTask.title}>
            Save
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default TaskModal;
