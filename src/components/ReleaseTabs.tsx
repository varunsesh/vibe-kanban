import React, { useState, MouseEvent } from 'react';
import {
  Box, Typography, IconButton, Button, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Menu, MenuItem
} from '@mui/material';
import { Plus, X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult, DraggableProvidedDraggableProps, DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { useProjectStore, useCanEditProject } from '../store/projectStore';
import { Release } from '../db/db';

const ReleaseTabs: React.FC = () => {
  const activeProjectId = useProjectStore((state) => state.activeProjectId);
  const releases = useProjectStore((state) => state.releases);
  const activeReleaseId = useProjectStore((state) => state.activeReleaseId);
  const selectRelease = useProjectStore((state) => state.selectRelease);
  const addRelease = useProjectStore((state) => state.addRelease);
  const updateRelease = useProjectStore((state) => state.updateRelease);
  const deleteRelease = useProjectStore((state) => state.deleteRelease);
  const reorderReleases = useProjectStore((state) => state.reorderReleases);
  
  const canEdit = useCanEditProject(activeProjectId);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [releaseName, setReleaseName] = useState('');

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; release: Release } | null>(null);

  const handleOpenAdd = () => {
    setEditingRelease(null);
    setReleaseName('');
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (release: Release) => {
    setEditingRelease(release);
    setReleaseName(release.name);
    setIsDialogOpen(true);
    setContextMenu(null);
  };

  const handleSave = async () => {
    if (!releaseName.trim()) return;
    if (editingRelease) {
      await updateRelease({ ...editingRelease, name: releaseName.trim() });
    } else {
      await addRelease(releaseName.trim());
    }
    setIsDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this release? Tasks will be unassigned.')) {
      await deleteRelease(id);
    }
    setContextMenu(null);
  };

  const handleContextMenu = (event: MouseEvent, release: Release) => {
    event.preventDefault();
    if (!canEdit) return;
    setContextMenu(
      contextMenu === null
        ? { mouseX: event.clientX + 2, mouseY: event.clientY - 6, release }
        : null,
    );
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    reorderReleases(result.source.index, result.destination.index);
  };

  const renderTab = (
    id: string | null, 
    name: string, 
    release?: Release, 
    draggableProps?: DraggableProvidedDraggableProps, 
    dragHandleProps?: DraggableProvidedDragHandleProps, 
    innerRef?: (element: HTMLElement | null) => void
  ) => {
    const isActive = activeReleaseId === id || (id === null && activeReleaseId === null);
    
    return (
      <Box
        ref={innerRef}
        {...draggableProps}
        {...dragHandleProps}
        onClick={() => selectRelease(id)}
        onContextMenu={(e) => release && handleContextMenu(e, release)}
        sx={{
          position: 'relative',
          height: 36,
          px: 3,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          minWidth: 120,
          maxWidth: 200,
          bgcolor: isActive ? 'background.default' : '#f5f5dc',
          transition: 'all 0.2s',
          clipPath: 'polygon(10% 0, 90% 0, 100% 100%, 0% 100%)',
          '&:hover': {
            bgcolor: isActive ? 'background.default' : '#ececb8',
            '& .close-btn': { opacity: 1 }
          },
          borderBottom: isActive ? 'none' : '1px solid',
          borderColor: 'divider',
          mr: -1.5, // Overlap for the trapezoid effect
          zIndex: isActive ? 2 : 1,
          ...draggableProps?.sx
        }}
      >
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: isActive ? 600 : 400,
            color: isActive ? 'primary.main' : 'text.secondary',
            noWrap: true,
            flexGrow: 1,
            textAlign: 'center',
            fontSize: '0.8rem'
          }}
        >
          {name}
        </Typography>
        {release && canEdit && (
          <IconButton
            className="close-btn"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(release.id);
            }}
            sx={{
              position: 'absolute',
              top: 2,
              right: '15%',
              p: 0.2,
              opacity: 0,
              transition: 'opacity 0.2s',
              '&:hover': { bgcolor: 'error.light', color: 'white' }
            }}
          >
            <X size={10} />
          </IconButton>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ bgcolor: '#f5f5dc', pt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', px: 2, gap: 0, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, mb: 0.5 }}>
          <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'text.secondary', letterSpacing: 1 }}>
            RELEASES
          </Typography>
          {canEdit && (
            <IconButton size="small" onClick={handleOpenAdd} sx={{ ml: 0.5, p: 0.5 }}>
              <Plus size={14} />
            </IconButton>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexGrow: 1, overflowX: 'auto', pb: 0, '&::-webkit-scrollbar': { display: 'none' } }}>
          {renderTab(null, 'All Tasks')}
          
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="release-tabs" direction="horizontal">
              {(provided) => (
                <Box
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  sx={{ display: 'flex' }}
                >
                  {releases.map((release, index) => (
                    <Draggable key={release.id} draggableId={release.id} index={index}>
                      {(dragProvided) => (
                        renderTab(
                          release.id, 
                          release.name, 
                          release, 
                          dragProvided.draggableProps, 
                          dragProvided.dragHandleProps, 
                          dragProvided.innerRef
                        )
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </Box>
              )}
            </Droppable>
          </DragDropContext>
        </Box>
      </Box>

      {/* Context Menu */}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <MenuItem onClick={() => contextMenu && handleOpenEdit(contextMenu.release)}>Rename</MenuItem>
        <MenuItem onClick={() => contextMenu && handleDelete(contextMenu.release.id)} sx={{ color: 'error.main' }}>Delete</MenuItem>
      </Menu>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
        <DialogTitle>{editingRelease ? 'Rename Release' : 'Create Release'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Release Name"
            fullWidth
            variant="outlined"
            value={releaseName}
            onChange={(e) => setReleaseName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDialogOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleSave()} variant="contained" disabled={!releaseName.trim()}>
            {editingRelease ? 'Rename' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ReleaseTabs;
