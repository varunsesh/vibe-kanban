import React, { useState } from 'react';
import { Box, Typography, Paper, IconButton, TextField } from '@mui/material';
import { Droppable } from '@hello-pangea/dnd';
import { Plus, X, Check } from 'lucide-react';
import { Task } from '../db/db';
import TaskCard from './TaskCard';

interface ColumnProps {
  id: string;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: string) => void;
  onRenameColumn: (id: string, newTitle: string) => void;
  onDeleteColumn: (id: string) => void;
}

const Column: React.FC<ColumnProps> = ({ 
  id, title, tasks, onTaskClick, onAddTask, onRenameColumn, onDeleteColumn 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(title);

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== title) {
      onRenameColumn(id, editTitle);
    }
    setIsEditing(false);
  };

  return (
    <Box sx={{ width: 300, display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
      <Paper
        sx={{
          p: 1.5,
          bgcolor: '#ebecf0',
          borderRadius: 2,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '100%',
          boxShadow: '0 1px 0 rgba(9,30,66,.25)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, px: 0.5 }}>
          {isEditing ? (
            <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
              <TextField
                size="small"
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleRename}
                onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                sx={{ bgcolor: 'white', borderRadius: 1 }}
              />
              <IconButton size="small" onClick={handleRename}><Check size={16} /></IconButton>
            </Box>
          ) : (
            <Typography 
              variant="subtitle1" 
              sx={{ fontWeight: 600, flexGrow: 1, cursor: 'pointer', py: 0.5 }}
              onClick={() => setIsEditing(true)}
            >
              {title}
            </Typography>
          )}
          <Box>
            <IconButton size="small" onClick={() => onAddTask(id)}>
              <Plus size={18} />
            </IconButton>
            <IconButton size="small" onClick={() => onDeleteColumn(id)}>
              <X size={18} />
            </IconButton>
          </Box>
        </Box>

        <Droppable droppableId={id}>
          {(provided, snapshot) => (
            <Box
              ref={provided.innerRef}
              {...provided.droppableProps}
              sx={{
                flexGrow: 1,
                minHeight: 10,
                transition: 'background-color 0.2s ease',
                bgcolor: snapshot.isDraggingOver ? 'rgba(0, 0, 0, 0.05)' : 'transparent',
                borderRadius: 1,
                overflowY: 'auto',
                px: 0.5
              }}
            >
              {tasks.map((task, index) => (
                <TaskCard key={task.id} task={task} index={index} onClick={onTaskClick} />
              ))}
              {provided.placeholder}
            </Box>
          )}
        </Droppable>
      </Paper>
    </Box>
  );
};

export default Column;
