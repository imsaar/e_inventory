import { useEffect, useState } from 'react';
import { Plus, Folder, Calendar, Trash2, Square, CheckSquare } from 'lucide-react';
import { Project } from '../types';
import { ProjectForm } from '../components/ProjectForm';
import { BulkDeleteDialog } from '../components/BulkDeleteDialog';
import { LinkifiedText } from '../utils/linkify';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSaved = () => {
    loadProjects();
    setShowForm(false);
    setEditingProject(null);
  };

  const handleProjectDeleted = () => {
    loadProjects();
    setShowForm(false);
    setEditingProject(null);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setShowForm(true);
  };

  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedProjects(new Set());
  };

  const toggleProjectSelection = (projectId: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const selectAllProjects = () => {
    const allProjectIds = new Set(projects.map(p => p.id));
    setSelectedProjects(allProjectIds);
  };

  const clearSelection = () => {
    setSelectedProjects(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedProjects.size > 0) {
      setShowBulkDelete(true);
    }
  };

  const handleBulkDeleteComplete = (results: any) => {
    setShowBulkDelete(false);
    setBulkMode(false);
    setSelectedProjects(new Set());
    loadProjects();
    
    if (results.summary) {
      const { deleted, failed } = results.summary;
      let message = `Bulk delete completed.\n`;
      if (deleted > 0) message += `✓ ${deleted} projects deleted successfully\n`;
      if (failed > 0) message += `⚠ ${failed} projects could not be deleted due to dependencies`;
      alert(message);
    }
  };

  const getStatusColor = (status: Project['status']) => {
    switch (status) {
      case 'planning': return '#2196f3';
      case 'active': return '#4caf50';
      case 'completed': return '#9c27b0';
      case 'on_hold': return '#ff9800';
      default: return '#666';
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return <div className="loading">Loading projects...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Projects ({projects.length})</h1>
        <div className="header-actions">
          {projects.length > 0 && (
            <button 
              className={`btn btn-secondary ${bulkMode ? 'active' : ''}`}
              onClick={toggleBulkMode}
            >
              <Square size={20} />
              {bulkMode ? 'Exit Bulk Mode' : 'Bulk Select'}
            </button>
          )}
          
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
            disabled={bulkMode}
          >
            <Plus size={20} />
            New Project
          </button>
        </div>
      </div>

      {bulkMode && (
        <div className="bulk-controls">
          <div className="bulk-info">
            <span className="selected-count">
              {selectedProjects.size} selected
            </span>
            <div className="bulk-actions">
              <button 
                className="btn btn-small btn-secondary"
                onClick={selectAllProjects}
                disabled={selectedProjects.size === projects.length}
              >
                Select All
              </button>
              <button 
                className="btn btn-small btn-secondary"
                onClick={clearSelection}
                disabled={selectedProjects.size === 0}
              >
                Clear
              </button>
              <button 
                className="btn btn-small btn-danger"
                onClick={handleBulkDelete}
                disabled={selectedProjects.size === 0}
              >
                <Trash2 size={14} />
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="projects-grid">
        {projects.map(project => {
          const isSelected = selectedProjects.has(project.id);
          return (
            <div key={project.id} className={`project-card ${isSelected ? 'selected' : ''}`}>
              <div className="project-header">
                {bulkMode && (
                  <div className="selection-checkbox">
                    <button
                      onClick={() => toggleProjectSelection(project.id)}
                      className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
                    >
                      {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </div>
                )}
                
                <div className="project-title">
                  <Folder size={20} />
                  <h3>{project.name}</h3>
                </div>
                <span 
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(project.status) }}
                >
                  {project.status.replace('_', ' ')}
                </span>
              </div>

            {project.description && (
              <p className="project-description">
                <LinkifiedText>{project.description}</LinkifiedText>
              </p>
            )}

            <div className="project-meta">
              {project.startDate && (
                <div className="meta-item">
                  <Calendar size={14} />
                  Started: {formatDate(project.startDate)}
                </div>
              )}
              
              {project.completedDate && (
                <div className="meta-item">
                  <Calendar size={14} />
                  Completed: {formatDate(project.completedDate)}
                </div>
              )}
            </div>

            <div className="project-actions">
              {!bulkMode && (
                <>
                  <button className="btn btn-secondary">View Details</button>
                  <button 
                    className="btn btn-secondary"
                    onClick={() => handleEdit(project)}
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {projects.length === 0 && (
        <div className="empty-state">
          <Folder size={48} />
          <h3>No projects yet</h3>
          <p>Create your first project to start organizing your electronics work.</p>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
          >
            <Plus size={20} />
            Create First Project
          </button>
        </div>
      )}

      {showForm && (
        <ProjectForm
          project={editingProject}
          onSave={handleProjectSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingProject(null);
          }}
          onDelete={editingProject ? handleProjectDeleted : undefined}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteDialog
          items={Array.from(selectedProjects)}
          itemType="projects"
          onCancel={() => setShowBulkDelete(false)}
          onConfirm={handleBulkDeleteComplete}
        />
      )}
    </div>
  );
}