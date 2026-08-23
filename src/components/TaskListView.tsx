import React, { useMemo, useState } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, Chip, Avatar, Tooltip, Button, IconButton, Menu, MenuItem,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import { Plus, ChevronRight, ChevronDown, GripVertical, GitMerge } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { useUserStore } from '../store/userStore';
import { Task } from '../db/db';
import { buildTaskTree, flattenTreeExpanded, TaskNode, getDescendantIds } from '../utils/taskTree';

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
  const reorderTasks = useProjectStore((state) => state.reorderTasks);
  const linkAsSubTask = useProjectStore((state) => state.linkAsSubTask);
  const openTaskModal = useAppStore((state) => state.openTaskModal);
  const users = useUserStore((state) => state.users);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Per-row "+" menu state
  const [menuState, setMenuState] = useState<{ anchor: HTMLElement; taskId: string } | null>(null);

  // Link-existing dialog state
  const [linkDialog, setLinkDialog] = useState<{ parentId: string } | null>(null);
  const [linkSearch, setLinkSearch] = useState('');

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
  const flatRows = useMemo(() => flattenTreeExpanded(tree, expandedIds), [tree, expandedIds]);

  // Tasks eligible to be linked as sub-task under a parent
  const linkableTasks = useMemo(() => {
    if (!linkDialog) return [];
    const parentId = linkDialog.parentId;
    const descendants = getDescendantIds(parentId, tasks);
    return tasks.filter(t =>
      t.id !== parentId &&
      !descendants.has(t.id) &&
      t.parentTaskId !== parentId &&
      (linkSearch === '' || t.title.toLowerCase().includes(linkSearch.toLowerCase()))
    );
  }, [linkDialog, tasks, linkSearch]);

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || result.destination.index === result.source.index) return;
    const draggedNode = flatRows[result.source.index];
    const targetNode = flatRows[result.destination.index];
    if (!draggedNode || !targetNode) return;
    void reorderTasks(draggedNode.task.id, targetNode.task.id);
  };

  const openMenu = (e: React.MouseEvent<HTMLElement>, taskId: string) => {
    e.stopPropagation();
    setMenuState({ anchor: e.currentTarget, taskId });
  };
  const closeMenu = () => setMenuState(null);

  const handleNewSubTask = () => {
    if (!menuState) return;
    const parent = tasks.find(t => t.id === menuState.taskId);
    closeMenu();
    openTaskModal(null, parent?.status, menuState.taskId);
  };

  const handleLinkExisting = () => {
    if (!menuState) return;
    const parentId = menuState.taskId;
    closeMenu();
    setLinkSearch('');
    setLinkDialog({ parentId });
  };

  const handleLinkConfirm = async (taskId: string) => {
    if (!linkDialog) return;
    await linkAsSubTask(taskId, linkDialog.parentId);
    setLinkDialog(null);
  };

  const renderRow = (node: TaskNode, dragIndex: number) => {
    const { task, children, depth } = node;
    const assignee = task.assigneeId ? usersById.get(task.assigneeId) : null;
    const hasChildren = children.length > 0;
    const isCollapsed = !expandedIds.has(task.id);

    return (
      <Draggable key={task.id} draggableId={task.id} index={dragIndex}>
        {(provided, snapshot) => (
          <TableRow
            ref={provided.innerRef}
            {...provided.draggableProps}
            hover
            sx={{
              cursor: 'pointer',
              bgcolor: snapshot.isDragging ? '#e8f0fe' : 'inherit',
              '&:last-child td, &:last-child th': { border: 0 },
              boxShadow: snapshot.isDragging ? '0 4px 16px rgba(0,0,0,0.15)' : 'none',
            }}
          >
            {/* Drag handle */}
            <TableCell sx={{ width: 32, px: 0.5, color: 'text.disabled' }}>
              <Box {...provided.dragHandleProps} sx={{ display: 'flex', alignItems: 'center', cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
                <GripVertical size={16} />
              </Box>
            </TableCell>

            {/* Task ID */}
            <TableCell
              component="th" scope="row"
              sx={{ color: 'primary.main', fontWeight: 500, whiteSpace: 'nowrap' }}
              onClick={() => openTaskModal(task.id)}
            >
              {task.id}
            </TableCell>

            {/* Title with tree indentation */}
            <TableCell sx={{ py: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', pl: depth * (INDENT_PX / 8) }}>
                {hasChildren ? (
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggle(task.id); }} sx={{ mr: 0.5, p: 0.25 }}>
                    {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </IconButton>
                ) : (
                  <Box sx={{ width: 28, flexShrink: 0 }} />
                )}
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
                    label={`${children.length} sub`}
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

            {/* Add sub-task button */}
            <TableCell sx={{ width: 40, px: 0.5 }}>
              <Tooltip title="Add sub-task">
                <IconButton size="small" onClick={(e) => openMenu(e, task.id)} sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                  <Plus size={16} />
                </IconButton>
              </Tooltip>
            </TableCell>
          </TableRow>
        )}
      </Draggable>
    );
  };

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => openTaskModal(null)} sx={{ borderRadius: 2 }}>
          Add Task
        </Button>
      </Box>

      <TableContainer component={Paper} sx={{ flexGrow: 1, borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <DragDropContext onDragEnd={handleDragEnd}>
          <Table stickyHeader aria-label="task tree table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 32 }} />
                <TableCell sx={{ fontWeight: 'bold' }}>Task ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Title</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Priority</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Assignee</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Created At</TableCell>
                <TableCell sx={{ width: 40 }} />
              </TableRow>
            </TableHead>
            <Droppable droppableId="task-list">
              {(provided) => (
                <TableBody ref={provided.innerRef} {...provided.droppableProps}>
                  {flatRows.map((node, i) => renderRow(node, i))}
                  {provided.placeholder}
                  {tasks.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                        <Typography variant="h6" color="text.secondary">No tasks found in this project.</Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              )}
            </Droppable>
          </Table>
        </DragDropContext>
      </TableContainer>

      {/* Per-row "+" menu */}
      <Menu
        open={!!menuState}
        anchorEl={menuState?.anchor}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={handleNewSubTask}>
          <Plus size={16} style={{ marginRight: 8 }} />
          New sub-task
        </MenuItem>
        <MenuItem onClick={handleLinkExisting}>
          <GitMerge size={16} style={{ marginRight: 8 }} />
          Link existing task as sub-task
        </MenuItem>
      </Menu>

      {/* Link existing task dialog */}
      <Dialog open={!!linkDialog} onClose={() => setLinkDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Link existing task as sub-task</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            placeholder="Search tasks…"
            value={linkSearch}
            onChange={(e) => setLinkSearch(e.target.value)}
            sx={{ mb: 2, mt: 1 }}
          />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 360, overflowY: 'auto' }}>
            {linkableTasks.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                {linkSearch ? 'No matching tasks.' : 'No tasks available to link.'}
              </Typography>
            )}
            {linkableTasks.map(t => (
              <Box
                key={t.id}
                onClick={() => void handleLinkConfirm(t.id)}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1.5,
                  px: 2, py: 1.25, borderRadius: 1,
                  border: '1px solid #e0e0e0', cursor: 'pointer',
                  '&:hover': { bgcolor: '#f0f4ff', borderColor: 'primary.main' },
                }}
              >
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{t.title}</Typography>
                  <Typography variant="caption" color="text.secondary">{t.id} · {t.priority}</Typography>
                </Box>
                {t.parentTaskId && (
                  <Chip label="has parent" size="small" sx={{ ml: 'auto', fontSize: '0.6rem' }} />
                )}
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialog(null)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TaskListView;
