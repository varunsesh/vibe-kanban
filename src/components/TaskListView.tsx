import React from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip, Avatar, Tooltip, Button
} from '@mui/material';
import { Plus } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { useUserStore } from '../store/userStore';
import { Task } from '../db/db';

const TaskListView: React.FC = () => {
  const tasks = useProjectStore((state) => state.tasks);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const openTaskModal = useAppStore((state) => state.openTaskModal);
  const users = useUserStore((state) => state.users);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  
  const columnMap = React.useMemo(() => {
    const columns = activeProject?.columns || [];
    const map = new Map<string, string>();
    columns.forEach(col => map.set(col.id, col.title));
    return map;
  }, [activeProject?.columns]);

  const usersById = React.useMemo(() => {
    const map = new Map<string, (typeof users)[number]>();
    for (const user of users) map.set(user.id, user);
    return map;
  }, [users]);

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => openTaskModal(null)}
          sx={{ borderRadius: 2 }}
        >
          Add Task
        </Button>
      </Box>
      <TableContainer component={Paper} sx={{ flexGrow: 1, borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <Table stickyHeader aria-label="all tasks table">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Task ID</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Title</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Assignee</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Created At</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks.map((task) => {
              const assignee = task.assigneeId ? usersById.get(task.assigneeId) : null;
              return (
                <TableRow
                  key={task.id}
                  hover
                  onClick={() => openTaskModal(task.id)}
                  sx={{ cursor: 'pointer', '&:last-child td, &:last-child th': { border: 0 } }}
                >
                  <TableCell component="th" scope="row" sx={{ color: 'primary.main', fontWeight: 500 }}>
                    {task.id}
                  </TableCell>
                  <TableCell>{task.title}</TableCell>
                  <TableCell>
                    <Chip 
                      label={columnMap.get(task.status) || task.status} 
                      size="small" 
                      variant="outlined" 
                    />
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={task.priority.toUpperCase()} 
                      size="small" 
                      color={getPriorityColor(task.priority)}
                    />
                  </TableCell>
                  <TableCell>
                    {assignee ? (
                      <Tooltip title={assignee.displayName}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar src={assignee.photoURL} sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                            {assignee.displayName[0]}
                          </Avatar>
                          <Typography variant="body2">{assignee.displayName}</Typography>
                        </Box>
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.secondary">Unassigned</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(task.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              );
            })}
            {tasks.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                  <Typography variant="h6" color="text.secondary">
                    No tasks found in this project.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default TaskListView;
