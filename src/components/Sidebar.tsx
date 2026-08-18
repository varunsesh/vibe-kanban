import React, { useCallback, useEffect, useState } from 'react';
import {
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Divider, IconButton, Box, Typography, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Tooltip
} from '@mui/material';
import { Layout, Plus, LogOut, ChevronLeft, ChevronRight, Trash2, FileSpreadsheet, RefreshCw, Settings } from 'lucide-react';
import { keyframes } from '@emotion/react';
import { useProjectStore } from '../store/projectStore';
import { useAppStore } from '../store/appStore';
import { useUserStore } from '../store/userStore';

const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;

const Sidebar: React.FC = () => {
  const currentUser = useUserStore((state) => state.currentUser);
  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const selectProject = useProjectStore((state) => state.selectProject);
  const addProject = useProjectStore((state) => state.addProject);
  const deleteProject = useProjectStore((state) => state.deleteProject);
  const syncFromSheets = useProjectStore((state) => state.syncFromSheets);

  const logout = useUserStore((state) => state.logout);

  const activeView = useAppStore((state) => state.activeView);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const sidebarOpen = useAppStore((state) => state.sidebarOpen);
  const sidebarWidth = useAppStore((state) => state.sidebarWidth);
  const addProjectDialogOpen = useAppStore((state) => state.addProjectDialogOpen);
  const newProjectName = useAppStore((state) => state.newProjectName);
  const projectToDeleteId = useAppStore((state) => state.projectToDeleteId);
  const setSidebarOpen = useAppStore((state) => state.setSidebarOpen);
  const setSidebarWidth = useAppStore((state) => state.setSidebarWidth);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const setAddProjectDialogOpen = useAppStore((state) => state.setAddProjectDialogOpen);
  const setNewProjectName = useAppStore((state) => state.setNewProjectName);
  const setProjectToDeleteId = useAppStore((state) => state.setProjectToDeleteId);

  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = Math.max(160, Math.min(600, e.clientX));
    setSidebarWidth(newWidth);
  }, [isResizing, setSidebarWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const projectToDelete = projects.find((project) => project.id === projectToDeleteId) || null;

  const handleAddProject = async () => {
    if (!newProjectName.trim()) return;
    await addProject(newProjectName.trim());
    setNewProjectName('');
    setAddProjectDialogOpen(false);
  };

  const canManageProject = (project: { ownerId: string; members: { userId: string; role: string }[] }) => {
    if (!currentUser) return false;
    if (currentUser.globalRole === 'Admin') return true;
    if (project.ownerId === currentUser.id) return true;
    return project.members?.some(m => m.userId === currentUser.id && m.role === 'Project Manager') ?? false;
  };

  const canDeleteProject = (project: { ownerId: string }) => {
    if (!currentUser) return false;
    return currentUser.globalRole === 'Admin' || project.ownerId === currentUser.id;
  };

  const currentWidth = sidebarOpen ? sidebarWidth : 64;

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: currentWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: currentWidth,
          boxSizing: 'border-box',
          transition: isResizing ? 'none' : 'width 0.2s ease',
          overflowX: 'hidden',
          position: 'relative',
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center' }}>
        {sidebarOpen && <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Kanban</Typography>}
        <IconButton onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </IconButton>
      </Box>

      <Divider />

      <List>
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton onClick={() => setAddProjectDialogOpen(true)} sx={{ minHeight: 48, justifyContent: sidebarOpen ? 'initial' : 'center', px: 2.5 }}>
            <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 3 : 'auto', justifyContent: 'center' }}>
              <Plus size={20} />
            </ListItemIcon>
            {sidebarOpen && <ListItemText primary="New Project" />}
          </ListItemButton>
        </ListItem>
        {currentUser?.globalRole === 'Admin' && (
          <ListItem disablePadding sx={{ display: 'block' }}>
            <ListItemButton
              onClick={() => setActiveView('settings')}
              selected={activeView === 'settings'}
              sx={{ minHeight: 48, justifyContent: sidebarOpen ? 'initial' : 'center', px: 2.5 }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 3 : 'auto', justifyContent: 'center' }}>
                <Settings size={20} />
              </ListItemIcon>
              {sidebarOpen && <ListItemText primary="Global Settings" />}
            </ListItemButton>
          </ListItem>
        )}
      </List>
      <Divider />

      <Box sx={{ px: 2, py: 1 }}>
        {sidebarOpen && <Typography variant="caption" sx={{ fontWeight: 'bold' }} color="text.secondary">PROJECTS</Typography>}
      </Box>

      <List sx={{ flexGrow: 1 }}>
        {projects.map((project) => (
          <ListItem key={project.id} disablePadding sx={{ display: 'block' }}>
            <ListItemButton
              selected={activeProjectId === project.id && activeView !== 'settings'}
              onClick={() => selectProject(project.id)}
              sx={{ minHeight: 48, justifyContent: sidebarOpen ? 'initial' : 'center', px: 2.5 }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 3 : 'auto', justifyContent: 'center' }}>
                <Layout size={20} />
              </ListItemIcon>
              {sidebarOpen && <ListItemText primary={project.name} />}

              {sidebarOpen && (
                <Box sx={{ display: 'flex' }}>
                  {project.spreadsheetId ? (
                    <>
                      <Tooltip title="Refresh from Sheets">
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            void syncFromSheets(project.id);
                          }}
                          disabled={isSyncing}
                        >
                          <RefreshCw
                            size={16}
                            style={{
                              animation: isSyncing && activeProjectId === project.id ? `${spin} 2s linear infinite` : 'none',
                            }}
                          />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Open Google Sheet">
                        <IconButton
                          size="small"
                          onClick={(event) => {
                            event.stopPropagation();
                            window.open(`https://docs.google.com/spreadsheets/d/${project.spreadsheetId}`, '_blank');
                          }}
                        >
                          <FileSpreadsheet size={16} color="#0f9d58" />
                        </IconButton>
                      </Tooltip>
                    </>
                  ) : null}

                  {canManageProject(project) && (
                    <Tooltip title="Project Settings">
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          selectProject(project.id);
                          setActiveView('projectSettings');
                        }}
                      >
                        <Settings size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                  {canDeleteProject(project) && (
                    <IconButton
                      size="small"
                      aria-label={`Delete ${project.name}`}
                      onMouseDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        setProjectToDeleteId(project.id);
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  )}
                </Box>
              )}
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      <List>
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton onClick={() => void logout()} sx={{ minHeight: 48, justifyContent: sidebarOpen ? 'initial' : 'center', px: 2.5 }}>
            <ListItemIcon sx={{ minWidth: 0, mr: sidebarOpen ? 3 : 'auto', justifyContent: 'center' }}>
              <LogOut size={20} />
            </ListItemIcon>
            {sidebarOpen && <ListItemText primary="Logout" />}
          </ListItemButton>
        </ListItem>
      </List>

      {sidebarOpen && (
        <Box
          onMouseDown={handleMouseDown}
          sx={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '4px',
            height: '100%',
            cursor: 'col-resize',
            '&:hover': {
              bgcolor: 'primary.main',
              opacity: 0.5,
            },
            transition: 'background-color 0.2s',
          }}
        />
      )}

      <Dialog open={addProjectDialogOpen} onClose={() => setAddProjectDialogOpen(false)}>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Project Name"
            fullWidth
            variant="outlined"
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddProjectDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleAddProject()} variant="contained" disabled={!newProjectName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(projectToDelete)} onClose={() => setProjectToDeleteId(null)}>
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Delete project "{projectToDelete?.name}" and all its tasks? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectToDeleteId(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (projectToDelete) {
                void deleteProject(projectToDelete.id);
              }
              setProjectToDeleteId(null);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Drawer>
  );
};

export default Sidebar;
