import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Component } from '../types';

interface ComponentDetailViewProps {
  componentId: string;
  onClose: () => void;
  onEdit: (component: Component) => void;
  onDelete: (componentId: string) => void;
}

export function ComponentDetailView({ componentId, onClose, onEdit, onDelete }: ComponentDetailViewProps) {
  const [component, setComponent] = useState<Component | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadComponent();
  }, [componentId]);

  const loadComponent = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/components/${componentId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Component not found');
        }
        throw new Error('Failed to load component');
      }
      
      const componentData = await response.json();
      setComponent(componentData);
    } catch (err) {
      console.error('Error loading component:', err);
      setError(err instanceof Error ? err.message : 'Failed to load component');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="loading">Loading component details...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2>Error</h2>
            <button onClick={onClose} className="btn-icon">
              <X size={20} />
            </button>
          </div>
          <div className="error-message">{error}</div>
          <div className="modal-actions">
            <button onClick={onClose} className="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>
    );
  }

  if (!component) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content large">
        <div className="modal-header">
          <h2>{component.name}</h2>
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <div className="component-detail-content">
          <div className="detail-section">
            <h3>Basic Information</h3>
            <p><strong>Part Number:</strong> {component.partNumber || 'N/A'}</p>
            <p><strong>Manufacturer:</strong> {component.manufacturer || 'N/A'}</p>
            <p><strong>Category:</strong> {component.category}</p>
            <p><strong>Status:</strong> {component.status}</p>
            <p><strong>Quantity:</strong> {component.quantity}</p>
            {component.unitCost && <p><strong>Unit Cost:</strong> ${component.unitCost}</p>}
            {component.totalCost && <p><strong>Total Cost:</strong> ${component.totalCost}</p>}
          </div>

          {component.description && (
            <div className="detail-section">
              <h3>Description</h3>
              <p>{component.description}</p>
            </div>
          )}
          
          <div className="modal-actions">
            <button onClick={() => onEdit(component)} className="btn btn-secondary">
              Edit
            </button>
            <button onClick={() => onDelete(component.id)} className="btn btn-danger">
              Delete
            </button>
            <button onClick={onClose} className="btn btn-primary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}