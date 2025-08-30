import { useState, useEffect } from 'react';
import { X, Save, Folder, Trash2 } from 'lucide-react';
import { Project } from '../types';

interface ProjectFormProps {
  project?: Project | null;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning', color: '#2196f3' },
  { value: 'active', label: 'Active', color: '#4caf50' },
  { value: 'on_hold', label: 'On Hold', color: '#ff9800' },
  { value: 'completed', label: 'Completed', color: '#9c27b0' }
];

export function ProjectForm({ project, onSave, onCancel, onDelete }: ProjectFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'planning' as Project['status'],
    startDate: '',
    completedDate: '',
    notes: ''
  });

  useEffect(() => {
    if (project) {
      setFormData({
        name: project.name || '',
        description: project.description || '',
        status: project.status || 'planning',
        startDate: project.startDate || '',
        completedDate: project.completedDate || '',
        notes: project.notes || ''
      });
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = {
        ...formData,
        startDate: formData.startDate || undefined,
        completedDate: formData.completedDate || undefined,
        notes: formData.notes || undefined
      };

      const url = project 
        ? `/api/projects/${project.id}` 
        : '/api/projects';
      
      const method = project ? 'PUT' : 'POST';
      
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      });

      onSave();
    } catch (error) {
      console.error('Error saving project:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const statusObj = PROJECT_STATUSES.find(s => s.value === status);
    return statusObj ? statusObj.color : '#666';
  };

  const handleDelete = async () => {
    if (!project || !onDelete) return;
    
    if (confirm(`Are you sure you want to delete "${project.name}"? This action cannot be undone.`)) {
      try {
        await fetch(`/api/projects/${project.id}`, {
          method: 'DELETE'
        });
        onDelete();
      } catch (error) {
        console.error('Error deleting project:', error);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>
            <Folder size={20} />
            {project ? 'Edit Project' : 'Create New Project'}
          </h2>
          <button onClick={onCancel} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="component-form">
          <div className="form-group">
            <label className="form-label">Project Name *</label>
            <input
              type="text"
              className="form-input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="e.g., Arduino Weather Station, LED Matrix Display"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              placeholder="Describe what this project is about, its goals, and key features..."
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                style={{ borderLeftColor: getStatusColor(formData.status), borderLeftWidth: '4px' }}
              >
                {PROJECT_STATUSES.map(status => (
                  <option key={status.value} value={status.value}>{status.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input
                type="date"
                className="form-input"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
          </div>

          {formData.status === 'completed' && (
            <div className="form-group">
              <label className="form-label">Completed Date</label>
              <input
                type="date"
                className="form-input"
                value={formData.completedDate}
                onChange={(e) => setFormData({ ...formData, completedDate: e.target.value })}
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              placeholder="Additional notes, lessons learned, future improvements..."
            />
          </div>

          <div className="project-preview">
            <h4>Project Preview:</h4>
            <div className="preview-card">
              <div className="preview-header">
                <span className="preview-name">{formData.name || 'Untitled Project'}</span>
                <span 
                  className="preview-status"
                  style={{ backgroundColor: getStatusColor(formData.status) }}
                >
                  {PROJECT_STATUSES.find(s => s.value === formData.status)?.label}
                </span>
              </div>
              {formData.description && (
                <p className="preview-description">{formData.description}</p>
              )}
            </div>
          </div>

          <div className="form-actions">
            {project && onDelete && (
              <button 
                type="button" 
                onClick={handleDelete} 
                className="btn btn-danger"
                style={{ marginRight: 'auto' }}
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Save size={16} />
              {project ? 'Update Project' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}