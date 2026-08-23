import React from 'react';
import { Box, Typography, Paper, IconButton, TextField, Card, CardContent, Avatar, Tooltip } from '@mui/material';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, X, Check } from 'lucide-react';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { useUserStore } from '../store/userStore';

const Column: React.FC = () => {
  const projects = useProjectStore((state) => state.projects);
  const tasks = useProjectStore((state) => state.tasks);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const renameColumn = useProjectStore((state) => state.renameColumn);
  const deleteColumn = useProjectStore((state) => state.deleteColumn);

  const openTaskModal = useAppStore((state) => state.openTaskModal);
  const columnEditingId = useAppStore((state) => state.columnEditingId);
  const columnTitleDraft = useAppStore((state) => state.columnTitleDraft);
  const startColumnRename = useAppStore((state) => state.startColumnRename);
  const setColumnTitleDraft = useAppStore((state) => state.setColumnTitleDraft);
  const stopColumnRename = useAppStore((state) => state.stopColumnRename);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const columns = activeProject?.columns || [];

  // Only show leaf tasks on the board — tasks that have no children.
  // Parent/summary tasks are managed via the task list view.
  const parentIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const task of tasks) {
      if (task.parentTaskId) set.add(task.parentTaskId);
    }
    return set;
  }, [tasks]);

  const users = useUserStore((state) => state.users);
  const usersById = React.useMemo(() => {
    const map = new Map<string, (typeof users)[number]>();
    for (const user of users) map.set(user.id, user);
    return map;
  }, [users]);

  const handleRename = async (columnId: string, existingTitle: string) => {
    const nextTitle = columnTitleDraft.trim();
    if (nextTitle && nextTitle !== existingTitle) {
      await renameColumn(columnId, nextTitle);
    }
    stopColumnRename();
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, overflowX: 'auto', pb: 2, alignItems: 'flex-start' }}>
      {columns.map((column) => (
        <Box key={column.id} sx={{ width: 300, display: 'flex', flexDirection: 'column', height: '100%', flexShrink: 0 }}>
          <Paper
            sx={{
              p: 1.5,
              bgcolor: '#ebecf0',
              borderRadius: 2,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '100%',
              boxShadow: '0 1px 0 rgba(9,30,66,.25)',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1, px: 0.5 }}>
              {columnEditingId === column.id ? (
                <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                  <TextField
                    size="small"
                    autoFocus
                    value={columnTitleDraft}
                    onChange={(event) => setColumnTitleDraft(event.target.value)}
                    onBlur={() => void handleRename(column.id, column.title)}
                    onKeyDown={(event) => event.key === 'Enter' && void handleRename(column.id, column.title)}
                    sx={{ bgcolor: 'white', borderRadius: 1 }}
                  />
                  <IconButton size="small" onClick={() => void handleRename(column.id, column.title)}><Check size={16} /></IconButton>
                </Box>
              ) : (
                <Typography
                  variant="subtitle1"
                  sx={{ fontWeight: 600, flexGrow: 1, cursor: 'pointer', py: 0.5 }}
                  onClick={() => startColumnRename(column.id, column.title)}
                >
                  {column.title}
                </Typography>
              )}
              <Box>
                <IconButton size="small" onClick={() => openTaskModal(null, column.id)}>
                  <Plus size={18} />
                </IconButton>
                <IconButton size="small" onClick={() => void deleteColumn(column.id)}>
                  <X size={18} />
                </IconButton>
              </Box>
            </Box>

            <Droppable droppableId={column.id}>
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
                    px: 0.5,
                  }}
                >
                  {tasks
                    .filter((task) => task.status === column.id && !parentIds.has(task.id))
                    .map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(dragProvided) => (
                          <Card
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            sx={{ mb: 1, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                            onClick={() => openTaskModal(task.id)}
                          >
                            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                              <Typography variant="subtitle2" gutterBottom>{task.title}</Typography>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                <Box
                                  sx={{
                                    width: 24,
                                    height: 4,
                                    borderRadius: 1,
                                    bgcolor:
                                      task.priority === 'high' ? 'error.main' :
                                      task.priority === 'medium' ? 'warning.main' : 'success.main',
                                  }}
                                />
                                {task.assigneeId && (
                                  (() => {
                                    const user = usersById.get(task.assigneeId);
                                    const label = user?.displayName || task.assigneeId;
                                    return (
                                      <Tooltip title={`Assigned to ${label}`}>
                                        <Avatar
                                          src={user?.photoURL || undefined}
                                          sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
                                        >
                                          {(label[0] || '?').toUpperCase()}
                                        </Avatar>
                                      </Tooltip>
                                    );
                                  })()
                                )}
                              </Box>
                            </CardContent>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                  {provided.placeholder}
                </Box>
              )}
            </Droppable>
          </Paper>
        </Box>
      ))}
    </Box>
  );
};

export default Column;
