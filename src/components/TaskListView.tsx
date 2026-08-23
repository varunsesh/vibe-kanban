import React, { useMemo, useState } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip, Avatar, Tooltip, Button, IconButton,
} from '@mui/material';
import { Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { useUserStore } from '../store/userStore';
import { Task } from '../db/db';
import { buildTaskTree, flattenTree, TaskNode } from '../utils/taskTree';

const INDENT_PX = 20;

const getPriorityColor = (priority: Task['priority']) => {
  switch (priority) {
    case 'high': return 'error';
    case 'medium': return 'warning';
    case 'low': return 'success';
    default: return 'default';
  }
};

const TaskListView: React.FC = () => {
  const tasks = useProjectStore((state) => state.tasks);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const openTaskModal = useAppStore((state) => state.openTaskModal);
  const users = useUserStore((state) => state.users);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const activeProject = projects.find((p) => p.id === activeProjectId);

  const columnMap = useMemo(() => {
    const map = new Map<string, string>();
    (activeProject?.columns || []).forEach(col => map.set(col.id, col.title));
    return map;
  }, [activeProject?.columns]);

  const usersById = useMemo(() => {
    const map = new Map<string, (typeof users)[number]>();
    for (const user of users) map.set(user.id, user);
    return map;
  }, [users]);

  const tree = useMemo(() => buildTaskTree(tasks), [tasks]);
  const flatRows = useMemo(() => flattenTree(tree, collapsedIds), [tree, collapsedIds]);

  const toggle = (id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderRow = (node: TaskNode) => {
    const { task, children, depth } = node;
    const assignee = task.assigneeId ? usersById.get(task.assigneeId) : null;
    const hasChildren = children.length > 0;
    const isCollapsed = collapsedIds.has(task.id);

    return (
      <TableRow
        key={task.id}
        hover
        sx={{ cursor: 'pointer', '&:last-child td, &:last-child th': { border: 0 } }}
      >
        <TableCell
          component="th"
          scope="row"
          sx={{ color: 'primary.main', fontWeight: 500, whiteSpace: 'nowrap' }}
          onClick={() => openTaskModal(task.id)}
        >
          {task.id}
        </TableCell>

        <TableCell sx={{ py: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', pl: depth * INDENT_PX / 8 }}>
            {/* Collapse toggle or spacer */}
            {hasChildren ? (
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); toggle(task.id); }}
                sx={{ mr: 0.5, p: 0.25 }}
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </IconButton>
            ) : (
              <Box sx={{ width: 28, flexShrink: 0 }} />
            )}
            {/* Indentation line for children */}
            {depth > 0 && (
              <Box sx={{ width: 2, height: 20, bgcolor: 'divider', borderRadius: 1, mr: 1, flexShrink: 0 }} />
            )}
            <Typography
              variant="body2"
              onClick={() => openTaskModal(task.id)}
              sx={{ fontWeight: hasChildren ? 600 : 400, cursor: 'pointer', '&:hover': { color: 'primary.main' } }}
            >
              {task.title}
            </Typography>
            {hasChildren && (
              <Chip
                label={`${children.length} sub-task${children.length !== 1 ? 's' : ''}`}
                size="small"
                sx={{ ml: 1, height: 18, fontSize: '0.6rem', bgcolor: '#e8f0fe', color: 'primary.main' }}
              />
            )}
          </Box>
        </TableCell>

        <TableCell onClick={() => openTaskModal(task.id)}>
          <Chip label={columnMap.get(task.status) || task.status} size="small" variant="outlined" />
        </TableCell>

        <TableCell onClick={() => openTaskModal(task.id)}>
          <Chip label={task.priority.toUpperCase()} size="small" color={getPriorityColor(task.priority)} />
        </TableCell>

        <TableCell onClick={() => openTaskModal(task.id)}>
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

        <TableCell onClick={() => openTaskModal(task.id)}>
          {new Date(task.createdAt).toLocaleDateString()}
        </TableCell>
      </TableRow>
    );
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
        <Table stickyHeader aria-label="task tree table">
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
            {flatRows.map(node => renderRow(node))}
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
