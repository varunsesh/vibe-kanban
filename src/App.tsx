import React, { useState, useEffect } from 'react';
import { Box, Typography, CssBaseline, ThemeProvider, createTheme, Button, Paper, TextField, Divider } from '@mui/material';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { LogIn, Plus } from 'lucide-react';
import { db, Project, Task, User } from './db/db';
import { auth, signInWithGoogle, logout as firebaseLogout, onAuthStateChanged } from './auth/firebase';
import Sidebar from './components/Sidebar';
import Column from './components/Column';
import TaskModal from './components/TaskModal';

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
  console.log('App is rendering');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [initialTaskStatus, setInitialTaskStatus] = useState<string | undefined>();

  const loadProjects = React.useCallback(async () => {
    const allProjects = await db.getAll<Project>('projects');
    
    // Fix: Ensure all projects have a columns array (migrates old data)
    const migratedProjects = allProjects.map(p => ({
      ...p,
      columns: p.columns || [
        { id: 'todo', title: 'To Do' },
        { id: 'inprogress', title: 'In Progress' },
        { id: 'done', title: 'Done' }
      ]
    }));

    setProjects(migratedProjects);
    if (migratedProjects.length > 0) {
      const activeProjectStillExists = activeProjectId
        ? migratedProjects.some(project => project.id === activeProjectId)
        : false;
      if (!activeProjectId || !activeProjectStillExists) {
        setActiveProjectId(migratedProjects[0].id);
      }
    } else if (activeProjectId) {
      setActiveProjectId(null);
    }
  }, [activeProjectId]);

  const loadUsers = React.useCallback(async () => {
    const allUsers = await db.getAll<User>('users');
    setUsers(allUsers);
  }, []);

  const loadTasks = React.useCallback(async (projectId: string) => {
    const projectTasks = await db.getTasksByProject(projectId);
    setTasks(projectTasks);
  }, []);

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
        loadProjects();
        loadUsers();
      } else {
        // Check for local user session if not Firebase
        const localUserId = localStorage.getItem('localUserId');
        if (localUserId && !localUserId.startsWith('firebase:')) {
          const user = await db.getById<User>('users', localUserId);
          if (user) {
            setCurrentUser(user);
            loadProjects();
            loadUsers();
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
  }, [loadProjects, loadUsers]);

  useEffect(() => {
    if (activeProjectId) {
      loadTasks(activeProjectId);
    } else {
      setTasks([]);
    }
  }, [activeProjectId, loadTasks]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleUsernameLogin = async () => {
    if (!username.trim()) return;
    
    const user: User = {
      id: `local:${username.trim()}`,
      displayName: username.trim(),
      email: '',
      photoURL: ''
    };
    
    await db.put('users', user);
    localStorage.setItem('localUserId', user.id);
    setCurrentUser(user);
    loadProjects();
    loadUsers();
  };

  const handleLogout = async () => {
    try {
      if (currentUser?.id.startsWith('local:')) {
        localStorage.removeItem('localUserId');
        setCurrentUser(null);
      } else {
        await firebaseLogout();
        localStorage.removeItem('localUserId');
      }
      setActiveProjectId(null);
      setProjects([]);
      setTasks([]);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleAddProject = async (name: string) => {
    const newProject: Project = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      description: '',
      columns: [
        { id: 'todo', title: 'To Do' },
        { id: 'inprogress', title: 'In Progress' },
        { id: 'done', title: 'Done' }
      ],
      createdAt: Date.now(),
    };
    await db.put('projects', newProject);
    await loadProjects();
    setActiveProjectId(newProject.id);
  };

  const handleDeleteProject = async (projectId: string) => {
    await db.deleteTasksByProject(projectId);
    await db.delete('projects', projectId);
    await loadProjects();

    if (activeProjectId === projectId) {
      const remainingProjects = projects.filter(project => project.id !== projectId);
      setActiveProjectId(remainingProjects.length > 0 ? remainingProjects[0].id : null);
    }
  };

  const handleAddColumn = async () => {
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
      const newColumn = { id: Math.random().toString(36).substr(2, 9), title: 'New Column' };
      const updatedProject = { ...project, columns: [...project.columns, newColumn] };
      await db.put('projects', updatedProject);
      await loadProjects();
    }
  };

  const handleRenameColumn = async (columnId: string, newTitle: string) => {
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
      const updatedColumns = project.columns.map(col => 
        col.id === columnId ? { ...col, title: newTitle } : col
      );
      const updatedProject = { ...project, columns: updatedColumns };
      await db.put('projects', updatedProject);
      await loadProjects();
    }
  };

  const handleDeleteColumn = async (columnId: string) => {
    const project = projects.find(p => p.id === activeProjectId);
    if (project) {
      const updatedColumns = project.columns.filter(col => col.id !== columnId);
      const updatedProject = { ...project, columns: updatedColumns };
      await db.put('projects', updatedProject);
      await loadProjects();
      // Optionally handle tasks in the deleted column (e.g., move to another column or delete)
    }
  };

  const handleAddTask = (status: string) => {
    setInitialTaskStatus(status);
    setSelectedTask(null);
    setIsModalOpen(true);
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleSaveTask = async (task: Task) => {
    await db.put('tasks', task);
    if (activeProjectId) await loadTasks(activeProjectId);
    setIsModalOpen(false);
  };

  const handleDeleteTask = async (id: string) => {
    await db.delete('tasks', id);
    if (activeProjectId) await loadTasks(activeProjectId);
    setIsModalOpen(false);
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const task = tasks.find(t => t.id === draggableId);
    if (task) {
      const updatedTask: Task = {
        ...task,
        status: destination.droppableId
      };
      
      const updatedTasks = tasks.map(t => t.id === draggableId ? updatedTask : t);
      setTasks(updatedTasks);
      await db.put('tasks', updatedTask);
    }
  };

  const activeProject = projects.find(p => p.id === activeProjectId);

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
                onChange={(e) => setUsername(e.target.value)}
                sx={{ mb: 1 }}
              />
              <Button
                variant="contained"
                fullWidth
                onClick={handleUsernameLogin}
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
              onClick={handleLogin}
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
        <Sidebar 
          projects={projects} 
          activeProjectId={activeProjectId} 
          onSelectProject={setActiveProjectId}
          onAddProject={handleAddProject}
          onDeleteProject={handleDeleteProject}
          onLogout={handleLogout} 
        />
        
        <Box 
          component="main" 
          sx={{ 
            flexGrow: 1, 
            p: 3, 
            display: 'flex', 
            flexDirection: 'column', 
            overflow: 'hidden',
            bgcolor: '#0079bf', // Trello Blue background
            color: 'white'
          }}
        >
          {activeProject ? (
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
                  onClick={handleAddColumn}
                  sx={{ bgcolor: 'rgba(255,255,255,0.2)', '&:hover': { bgcolor: 'rgba(255,255,255,0.3)' } }}
                >
                  Add Column
                </Button>
              </Box>
              
              <DragDropContext onDragEnd={onDragEnd}>
                <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, overflowX: 'auto', pb: 2, alignItems: 'flex-start' }}>
                  {(activeProject?.columns || []).map(col => (
                    <Column 
                      key={col.id}
                      id={col.id} 
                      title={col.title} 
                      tasks={tasks.filter(t => t.status === col.id)} 
                      onTaskClick={handleTaskClick}
                      onAddTask={handleAddTask}
                      onRenameColumn={handleRenameColumn}
                      onDeleteColumn={handleDeleteColumn}
                    />
                  ))}
                </Box>
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

        <TaskModal 
          open={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          task={selectedTask}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          projectId={activeProjectId || ''}
          users={users}
          columns={activeProject?.columns || []}
          initialStatus={initialTaskStatus}
        />
      </Box>
    </ThemeProvider>
  );
};

export default App;
