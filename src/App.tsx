import React, { useEffect } from 'react';
import { Box, Typography, CssBaseline, ThemeProvider, createTheme, Button, Paper, TextField, Divider } from '@mui/material';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { LogIn, Plus } from 'lucide-react';
import { auth, onAuthStateChanged } from './auth/firebase';
import Sidebar from './components/Sidebar';
import Column from './components/Column';
import TaskModal from './components/TaskModal';
import { db, User } from './db/db';
import { useUserStore } from './store/userStore';
import { useProjectStore } from './store/projectStore';
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
  const setCurrentUser = useUserStore((state) => state.setCurrentUser);
  const setLoading = useUserStore((state) => state.setLoading);
  const setUsername = useUserStore((state) => state.setUsername);
  const loadUsers = useUserStore((state) => state.loadUsers);
  const loginWithGoogle = useUserStore((state) => state.loginWithGoogle);
  const loginWithUsername = useUserStore((state) => state.loginWithUsername);

  const projects = useProjectStore((state) => state.projects);
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const loadProjects = useProjectStore((state) => state.loadProjects);
  const addColumn = useProjectStore((state) => state.addColumn);
  const connectSheets = useProjectStore((state) => state.connectSheets);
  const moveTask = useProjectStore((state) => state.moveTask);

  const activeView = useAppStore((state) => state.activeView);
  const sheetLinkInput = useAppStore((state) => state.sheetLinkInput);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const setSheetLinkInput = useAppStore((state) => state.setSheetLinkInput);

  const activeProject = projects.find((project) => project.id === activeProjectId);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const user: User = {
          id: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Unknown User',
          email: firebaseUser.email || '',
          photoURL: firebaseUser.photoURL || '',
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
            overflow: 'hidden',
            bgcolor: '#0079bf',
            color: 'white',
          }}
        >
          {activeView === 'settings' ? (
            <Box sx={{ maxWidth: 720, width: '100%', mx: 'auto', mt: 2 }}>
              <Typography variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
                Project Settings
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9, mb: 3 }}>
                {activeProject ? `Configure sync for "${activeProject.name}"` : 'Select a project to configure sync settings.'}
              </Typography>

              {activeProject ? (
                <Paper sx={{ p: 3 }}>
                  <TextField
                    fullWidth
                    label="Google Sheet Link or Spreadsheet ID"
                    value={sheetLinkInput}
                    onChange={(event) => setSheetLinkInput(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    sx={{ mb: 2 }}
                  />
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="contained" disabled={isSyncing} onClick={() => void handleSaveSheetConfig()}>
                      Save Sheet Config
                    </Button>
                    {activeProject.spreadsheetId && (
                      <Button
                        variant="outlined"
                        onClick={() => window.open(`https://docs.google.com/spreadsheets/d/${activeProject.spreadsheetId}`, '_blank')}
                      >
                        Open Sheet
                      </Button>
                    )}
                  </Box>
                </Paper>
              ) : (
                <Typography variant="body1">No active project selected.</Typography>
              )}
            </Box>
          ) : activeProject ? (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                    {activeProject.name}
                  </Typography>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>
                    Signed in as {currentUser.displayName}
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  startIcon={<Plus />}
                  onClick={() => void addColumn()}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                >
                  Add Column
                </Button>
              </Box>

              <DragDropContext onDragEnd={(result) => void onDragEnd(result)}>
                <Column />
              </DragDropContext>
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
