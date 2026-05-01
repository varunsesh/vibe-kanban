import React from 'react';
import { Card, CardContent, Typography, Box, Avatar, Tooltip } from '@mui/material';
import { Draggable } from '@hello-pangea/dnd';
import { Task } from '../db/db';

interface TaskCardProps {
  task: Task;
  index: number;
  onClick: (task: Task) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, index, onClick }) => {
  return (
    <Draggable draggableId={task.id} index={index}>
      {(provided) => (
        <Card
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          sx={{ mb: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
          onClick={() => onClick(task)}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="subtitle2" gutterBottom>
              {task.title}
            </Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {/* Priority Indicator */}
                <Box
                  sx={{
                    width: 24,
                    height: 4,
                    borderRadius: 1,
                    bgcolor: 
                      task.priority === 'high' ? 'error.main' : 
                      task.priority === 'medium' ? 'warning.main' : 'success.main'
                  }}
                />
              </Box>
              {task.assigneeId && (
                <Tooltip title={`Assigned to ${task.assigneeId}`}>
                  <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                    {task.assigneeId[0].toUpperCase()}
                  </Avatar>
                </Tooltip>
              )}
            </Box>
          </CardContent>
        </Card>
      )}
    </Draggable>
  );
};

export default TaskCard;
