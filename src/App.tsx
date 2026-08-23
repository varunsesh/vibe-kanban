import React, { useEffect, useState } from 'react';
import { Box, Typography, CssBaseline, ThemeProvider, createTheme, Button, Paper, TextField, Divider, List, ListItem, ListItemText, ListItemSecondaryAction, IconButton, Select, MenuItem, FormControl, InputLabel, Chip, Tooltip } from '@mui/material';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { LogIn, Plus, Trash2, UserPlus, FileSpreadsheet, RefreshCw, ShieldCheck, ShieldAlert, LayoutDashboard, GanttChart } from 'lucide-react';
import { auth, onAuthStateChanged, handleRedirectResult } from './auth/firebase';
import Sidebar from './components/Sidebar';
import Column from './components/Column';
import TaskModal from './components/TaskModal';
import ReleaseTabs from './components/ReleaseTabs';
import TaskListView from './components/TaskListView';
import GanttView from './components/GanttView';
import { db, User } from './db/db';
import { useUserStore } from './store/userStore';
import { useProjectStore, useCanEditProject } from './store/projectStore';
import { useAppStore } from './store/appStore';

const theme = createTheme({
  palette: {
    primary: {
      main: '#0052cc',
    },
    background: {
      default: '#f4f5f7',
    },
  },
});

const App: React.FC = () => {
  const currentUser = useUserStore((state) => state.currentUser);
  const username = useUserStore((state) => state.username);
  const loading = useUserStore((state) => state.loading);
  const users = useUserStore((state) => state.users);
  const setCurrentUser = useUserStore((state) => state.setCurrentUser);
  const setLoading = useUserStore((state) => state.setLoading);
  const setUsername = useUserStore((state) => state.setUsername);
  const loadUsers = useUserStore((state) => state.loadUsers);
  const loginWithGoogle = useUserStore((state) => state.loginWithGoogle);
  const loginWithUsername = useUserStore((state) => state.loginWithUsername);
  const updateGlobalRole = useUserStore((state) => state.updateGlobalRole);

  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const addColumn = useProjectStore((state) => state.addColumn);
  const connectSheets = useProjectStore((state) => state.connectSheets);
  const moveTask = useProjectStore((state) => state.moveTask);
  const addMember = useProjectStore((state) => state.addMember);
  const removeMember = useProjectStore((state) => state.removeMember);

  const activeView = useAppStore((state) => state.activeView);
  const setActiveView = useAppStore((state) => state.setActiveView);
  const sheetLinkInput = useAppStore((state) => state.sheetLinkInput);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const setSheetLinkInput = useAppStore((state) => state.setSheetLinkInput);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeReleaseId = useProjectStore((state) => state.activeReleaseId);
  const canEditProject = useCanEditProject(activeProjectId);

  const [newMemberId, setNewMemberId] = useState('');
  const [newMemberRole, setNewMemberRole] = useState<'Project Manager' | 'Member'>('Member');

  useEffect(() => {
    // Process any pending OAuth redirect from signInWithGoogle()
    handleRedirectResult().catch(console.error);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const existing = await db.getById<User>('users', firebaseUser.uid);
        const user: User = {
          id: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Unknown User',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || '',
          globalRole: (firebaseUser.displayName?.toLowerCase() === 'admin' || existing?.globalRole === 'Admin') ? 'Admin' : 'User',
        };
        await db.put('users', user);
        localStorage.setItem('localUserId', user.id);
        setCurrentUser(user);
        await loadProjects();
        await loadUsers();
      } else {
        const localUserId = localStorage.getItem('localUserId');
        if (localUserId && !localUserId.startsWith('firebase:')) {
          const user = await db.getById<User>('users', localUserId);
          if (user) {
            setCurrentUser(user);
            await loadProjects();
            await loadUsers();
          } else {
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [loadProjects, loadUsers, setCurrentUser, setLoading]);

  useEffect(() => {
    setSheetLinkInput(
      activeProject?.spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${activeProject.spreadsheetId}`
        : ''
    );
  }, [activeProject?.id, activeProject?.spreadsheetId, setSheetLinkInput]);

  const handleSaveSheetConfig = async () => {
    if (!activeProjectId) return;
    try {
      await connectSheets(activeProjectId, sheetLinkInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to connect to Google Sheets: ${message}`);
    }
  };

  const handleAddMember = async () => {
    if (!activeProjectId || !newMemberId) return;
    await addMember(activeProjectId, newMemberId, newMemberRole);
    setNewMemberId('');
  };

  const onDragEnd = async (result: DropResult) => {
    await moveTask(result);
  };

  if (loading) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Typography>Loading...</Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (!currentUser) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
          <Paper sx={{ p: 4, textAlign: 'center', maxWidth: 400, width: '100%' }}>
            <Typography variant="h4" sx={{ fontWeight: 'bold' }} gutterBottom>
              Kanban Board
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
              Sign in to manage your projects and tasks.
            </Typography>

            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                label="Username"
                variant="outlined"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                sx={{ mb: 1 }}
              />
              <Button
                variant="contained"
                fullWidth
                onClick={() => void loginWithUsername()}
                disabled={!username.trim()}
              >
                Sign in with Username
              </Button>
            </Box>

            <Divider sx={{ mb: 3 }}>OR</Divider>

            <Button
              variant="outlined"
              fullWidth
              size="large"
              startIcon={<LogIn />}
              onClick={() => void loginWithGoogle()}
              sx={{ py: 1.5 }}
            >
              Sign in with Google
            </Button>
          </Paper>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
        <Sidebar />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            bgcolor: '#0079bf',
            color: 'white',
          }}
        >
          {activeView === 'settings' ? (
            <Box sx={{ maxWidth: 800, width: '100%', mx: 'auto', mt: 2, pb: 4 }}>
              {currentUser.globalRole !== 'Admin' ? (
                 <Paper sx={{ p: 3, bgcolor: '#fffbe6', border: '1px solid #ffe58f' }}>
                  <Typography color="warning.main" sx={{ fontWeight: 500 }}>
                    Access Restricted: Only System Admins can access global settings.
                  </Typography>
                </Paper>
              ) : (
                <>
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
                      Global Settings
                    </Typography>
                    <Typography variant="body1" sx={{ opacity: 0.9 }}>
                      System-wide administrative controls and user role management.
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <Paper sx={{ p: 3, borderRadius: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <ShieldCheck size={24} color="#0052cc" />
                        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>User Role Management</Typography>
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Assign Global Admin status to users. Admins can create projects and manage all system settings.
                      </Typography>

                      <List sx={{ bgcolor: 'background.paper', border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}>
                        {users.map((user, index) => {
                          const isGlobalAdmin = user.globalRole === 'Admin';
                          const isSelf = user.id === currentUser.id;
                          
                          return (
                            <ListItem 
                              key={user.id} 
                              divider={index !== users.length - 1}
                              sx={{ py: 1.5 }}
                            >
                              <ListItemText 
                                primary={
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography sx={{ fontWeight: 600 }}>{user.displayName}</Typography>
                                    {isSelf && <Chip label="You" size="small" variant="outlined" />}
                                  </Box>
                                }
                                secondary={user.email || user.id}
                              />
                              <ListItemSecondaryAction>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <Chip 
                                    icon={isGlobalAdmin ? <ShieldCheck size={14} /> : undefined} 
                                    label={isGlobalAdmin ? "Admin" : "User"} 
                                    color={isGlobalAdmin ? "primary" : "default"}
                                    variant={isGlobalAdmin ? "filled" : "outlined"}
                                    size="small"
                                  />
                                  {!isSelf && (
                                    <Button 
                                      size="small" 
                                      variant="outlined"
                                      color={isGlobalAdmin ? "error" : "primary"}
                                      startIcon={isGlobalAdmin ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />}
                                      sx={{ textTransform: 'none', minWidth: 120 }}
                                      onClick={() => void updateGlobalRole(user.id, isGlobalAdmin ? 'User' : 'Admin')}
                                    >
                                      {isGlobalAdmin ? 'Revoke Admin' : 'Make Admin'}
                                    </Button>
                                  )}
                                </Box>
                              </ListItemSecondaryAction>
                            </ListItem>
                          );
                        })}
                      </List>
                    </Paper>

                    <Paper sx={{ p: 3, borderRadius: 2, bgcolor: '#f8f9fa' }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>Administrative Notes</Typography>
                      <Typography variant="body2" color="text.secondary">
                        • Global Admins have permission to create new projects from the sidebar.<br />
                        • Global Admins can view and manage all projects in the system.<br />
                        • Only the bootstrap "admin" account or existing Admins can promote other users.
                      </Typography>
                    </Paper>
                  </Box>
                </>
              )}
            </Box>
          ) : activeView === 'projectSettings' ? (
            <Box sx={{ maxWidth: 800, width: '100%', mx: 'auto', mt: 2, pb: 4 }}>
              <Box sx={{ mb: 4 }}>
                <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
                  Project Settings
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                  {activeProject ? `Manage configuration and team for "${activeProject.name}"` : 'Select a project from the sidebar to view its settings.'}
                </Typography>
              </Box>

              {!activeProject ? (
                <Paper sx={{ p: 4, textAlign: 'center' }}>
                  <Typography variant="h6" color="text.secondary">
                    No project selected. Please select a project to manage its settings.
                  </Typography>
                </Paper>
              ) : !canEditProject ? (
                <Paper sx={{ p: 3, bgcolor: '#fffbe6', border: '1px solid #ffe58f' }}>
                  <Typography color="warning.main" sx={{ fontWeight: 500 }}>
                    Access Restricted: You do not have permission to manage this project. 
                    Only the Project Owner, Managers, or System Admins can access these settings.
                  </Typography>
                </Paper>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <FileSpreadsheet size={24} color="#0f9d58" />
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Google Sheets Synchronization</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Connect this project to a Google Sheet to enable cloud sync and collaboration.
                    </Typography>
                    <TextField
                      fullWidth
                      label="Spreadsheet Link or ID"
                      variant="outlined"
                      value={sheetLinkInput}
                      onChange={(event) => setSheetLinkInput(event.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      sx={{ mb: 2 }}
                    />
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button 
                        variant="contained" 
                        disabled={isSyncing} 
                        onClick={() => void handleSaveSheetConfig()}
                        startIcon={isSyncing ? <RefreshCw className="animate-spin" size={18} /> : null}
                      >
                        {isSyncing ? 'Connecting...' : 'Update Sync Configuration'}
                      </Button>
                      {activeProject.spreadsheetId && (
                        <Button
                          variant="outlined"
                          onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${activeProject.spreadsheetId}`, '_blank')}
                        >
                          Open Spreadsheet
                        </Button>
                      )}
                    </Box>
                  </Paper>

                  <Paper sx={{ p: 3, borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <UserPlus size={24} color="#0052cc" />
                      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Team Management</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                      Add or remove members and assign roles to control their permissions within this project.
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1, mb: 4, p: 2, bgcolor: '#f8f9fa', borderRadius: 1 }}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Select User</InputLabel>
                        <Select
                          value={newMemberId}
                          label="Select User"
                          onChange={(e) => setNewMemberId(e.target.value)}
                        >
                          {users.filter(u => u.id !== activeProject.ownerId && !activeProject.members.some(m => m.userId === u.id)).map(u => (
                            <MenuItem key={u.id} value={u.id}>
                              {u.displayName} ({u.email || u.id})
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>

                      <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Assign Role</InputLabel>
                        <Select
                          value={newMemberRole}
                          label="Assign Role"
                          onChange={(e) => setNewMemberRole(e.target.value as 'Project Manager' | 'Member')}
                        >
                          <MenuItem value="Member">Project Member</MenuItem>
                          <MenuItem value="Project Manager">Project Manager</MenuItem>
                        </Select>
                      </FormControl>

                      <Button 
                        variant="contained" 
                        onClick={() => void handleAddMember()}
                        disabled={!newMemberId}
                        sx={{ px: 4 }}
                      >
                        Add
                      </Button>
                    </Box>

                    <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>Active Members</Typography>
                    <List sx={{ bgcolor: 'background.paper', border: '1px solid #e0e0e0', borderRadius: 1, p: 0 }}>
                      <ListItem divider sx={{ py: 1.5 }}>
                        <ListItemText 
                          primary={<Typography sx={{ fontWeight: 600 }}>{users.find(u => u.id === activeProject.ownerId)?.displayName || activeProject.ownerId}</Typography>}
                          secondary="Project Owner (Full Control)" 
                        />
                        <ListItemSecondaryAction>
                           {users.find(u => u.id === activeProject.ownerId)?.globalRole === 'Admin' && (
                             <Chip icon={<ShieldCheck size={14} />} label="Global Admin" color="primary" size="small" variant="outlined" />
                           )}
                        </ListItemSecondaryAction>
                      </ListItem>
                      {activeProject.members.map((member, index) => {
                        const user = users.find(u => u.id === member.userId);
                        const isGlobalAdmin = user?.globalRole === 'Admin';
                        
                        return (
                          <ListItem 
                            key={member.userId} 
                            divider={index !== activeProject.members.length - 1}
                            sx={{ py: 1 }}
                          >
                            <ListItemText 
                              primary={user?.displayName || member.userId} 
                              secondary={
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                                  <Chip label={member.role} size="small" />
                                  {isGlobalAdmin && (
                                    <Chip icon={<ShieldCheck size={14} />} label="Global Admin" color="primary" size="small" variant="outlined" />
                                  )}
                                </Box>
                              }
                            />
                            <ListItemSecondaryAction>
                              <IconButton edge="end" color="error" onClick={() => void removeMember(activeProject.id, member.userId)}>
                                <Trash2 size={18} />
                              </IconButton>
                            </ListItemSecondaryAction>
                          </ListItem>
                        );
                      })}
                      {activeProject.members.length === 0 && (
                        <ListItem sx={{ py: 2 }}>
                          <Typography variant="body2" color="text.secondary">No additional members added yet.</Typography>
                        </ListItem>
                      )}
                    </List>
                  </Paper>
                </Box>
              )}
            </Box>
          ) : activeProject ? (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                    {activeProject.name}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Signed in as {currentUser.displayName}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {/* Board / Gantt view toggle */}
                  <Box sx={{ display: 'flex', bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 1, p: 0.5, gap: 0.5 }}>
                    <Tooltip title="Board / List view">
                      <IconButton
                        size="small"
                        onClick={() => setActiveView('board')}
                        sx={{
                          color: activeView !== 'gantt' ? 'white' : 'rgba(255,255,255,0.5)',
                          bgcolor: activeView !== 'gantt' ? 'rgba(255,255,255,0.25)' : 'transparent',
                          borderRadius: 0.75,
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                        }}
                      >
                        <LayoutDashboard size={18} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Gantt chart">
                      <IconButton
                        size="small"
                        onClick={() => setActiveView('gantt')}
                        sx={{
                          color: activeView === 'gantt' ? 'white' : 'rgba(255,255,255,0.5)',
                          bgcolor: activeView === 'gantt' ? 'rgba(255,255,255,0.25)' : 'transparent',
                          borderRadius: 0.75,
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' },
                        }}
                      >
                        <GanttChart size={18} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  {canEditProject && activeReleaseId && activeView !== 'gantt' && (
                    <Button
                      variant="contained"
                      startIcon={<Plus />}
                      onClick={() => void addColumn()}
                      sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                    >
                      Add Column
                    </Button>
                  )}
                </Box>
              </Box>

              {activeView === 'gantt' ? (
                <Box sx={{ flexGrow: 1, overflow: 'hidden', borderRadius: 1 }}>
                  <GanttView />
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden' }}>
                  <ReleaseTabs />
                  <Box sx={{ flexGrow: 1, overflowX: 'auto', p: 2 }}>
                    {activeReleaseId ? (
                      <DragDropContext onDragEnd={(result) => void onDragEnd(result)}>
                        <Column />
                      </DragDropContext>
                    ) : (
                      <TaskListView />
                    )}
                  </Box>
                </Box>
              )}
            </>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              <Typography variant="h6" color="white">
                Select or create a project to get started
              </Typography>
            </Box>
          )}
        </Box>

        <TaskModal />
      </Box>
    </ThemeProvider>
  );
};

export default App;
