import React, { useState } from 'react';
import { 
  Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, 
  Divider, IconButton, Box, Typography, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField 
} from '@mui/material';
import { Layout, Plus, LogOut, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { Project } from '../db/db';

interface SidebarProps {
  projects: Project[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onAddProject: (name: string) => void;
  onDeleteProject: (id: string) => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  projects, activeProjectId, onSelectProject, onAddProject, onDeleteProject, onLogout
}) => {
  const [open, setOpen] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  const handleAddProject = () => {
    if (newProjectName) {
      onAddProject(newProjectName);
      setNewProjectName('');
      setAddDialogOpen(false);
    }
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: open ? 240 : 64,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: open ? 240 : 64,
          boxSizing: 'border-box',
          transition: 'width 0.2s ease',
          overflowX: 'hidden'
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: open ? 'space-between' : 'center' }}>
        {open && <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Kanban</Typography>}
        <IconButton onClick={() => setOpen(!open)}>
          {open ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
        </IconButton>
      </Box>

      <Divider />

      <List>
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton onClick={() => setAddDialogOpen(true)} sx={{ minHeight: 48, justifyContent: open ? 'initial' : 'center', px: 2.5 }}>
            <ListItemIcon sx={{ minWidth: 0, mr: open ? 3 : 'auto', justifyContent: 'center' }}>
              <Plus size={20} />
            </ListItemIcon>
            {open && <ListItemText primary="New Project" />}
          </ListItemButton>
        </ListItem>
      </List>

      <Divider />

      <Box sx={{ px: 2, py: 1 }}>
        {open && <Typography variant="caption" sx={{ fontWeight: 'bold' }} color="text.secondary">PROJECTS</Typography>}
      </Box>

      <List sx={{ flexGrow: 1 }}>
        {projects.map((project) => (
          <ListItem key={project.id} disablePadding sx={{ display: 'block' }}>
            <ListItemButton
              selected={activeProjectId === project.id}
              onClick={() => onSelectProject(project.id)}
              sx={{ minHeight: 48, justifyContent: open ? 'initial' : 'center', px: 2.5 }}
            >
              <ListItemIcon sx={{ minWidth: 0, mr: open ? 3 : 'auto', justifyContent: 'center' }}>
                <Layout size={20} />
              </ListItemIcon>
              {open && <ListItemText primary={project.name} />}
              {open && (
                <IconButton
                  size="small"
                  aria-label={`Delete ${project.name}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectToDelete(project);
                  }}
                >
                  <Trash2 size={16} />
                </IconButton>
              )}
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      <List>
        <ListItem disablePadding sx={{ display: 'block' }}>
          <ListItemButton onClick={onLogout} sx={{ minHeight: 48, justifyContent: open ? 'initial' : 'center', px: 2.5 }}>
            <ListItemIcon sx={{ minWidth: 0, mr: open ? 3 : 'auto', justifyContent: 'center' }}>
              <LogOut size={20} />
            </ListItemIcon>
            {open && <ListItemText primary="Logout" />}
          </ListItemButton>
        </ListItem>
      </List>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)}>
        <DialogTitle>Create New Project</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Project Name"
            fullWidth
            variant="outlined"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleAddProject} variant="contained" disabled={!newProjectName}>Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(projectToDelete)}
        onClose={() => setProjectToDelete(null)}
      >
        <DialogTitle>Delete Project</DialogTitle>
        <DialogContent>
          <Typography>
            Delete project "{projectToDelete?.name}" and all its tasks? This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setProjectToDelete(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              if (projectToDelete) {
                onDeleteProject(projectToDelete.id);
              }
              setProjectToDelete(null);
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
