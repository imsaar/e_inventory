import { useState, useEffect } from 'react';
import { X, Save, MapPin, Trash2 } from 'lucide-react';
import { StorageLocation } from '../types';

interface LocationFormProps {
  location?: StorageLocation | null;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const LOCATION_TYPES = [
  { value: 'room', label: 'Room' },
  { value: 'cabinet', label: 'Cabinet' },
  { value: 'shelf', label: 'Shelf' },
  { value: 'drawer', label: 'Drawer' },
  { value: 'box', label: 'Box' },
  { value: 'compartment', label: 'Compartment' }
];

export function LocationForm({ location, onSave, onCancel, onDelete }: LocationFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'room' as StorageLocation['type'],
    parentId: '',
    description: '',
    generateQR: false
  });

  const [parentLocations, setParentLocations] = useState<StorageLocation[]>([]);

  useEffect(() => {
    if (location) {
      setFormData({
        name: location.name || '',
        type: location.type || 'room',
        parentId: location.parentId || '',
        description: location.description || '',
        generateQR: false
      });
    }
    loadParentLocations();
  }, [location]);

  const loadParentLocations = async () => {
    try {
      const response = await fetch('/api/locations');
      const data = await response.json();
      
      // Flatten hierarchical structure for parent selection
      const flattenLocations = (locs: any[], prefix = ''): StorageLocation[] => {
        const result: StorageLocation[] = [];
        locs.forEach((loc: any) => {
          const displayName = prefix ? `${prefix} > ${loc.name}` : loc.name;
          result.push({ ...loc, name: displayName });
          if (loc.children && loc.children.length > 0) {
            result.push(...flattenLocations(loc.children, displayName));
          }
        });
        return result;
      };
      
      setParentLocations(flattenLocations(data));
    } catch (error) {
      console.error('Error loading parent locations:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = {
        ...formData,
        parentId: formData.parentId || undefined
      };

      const url = location 
        ? `/api/locations/${location.id}` 
        : '/api/locations';
      
      const method = location ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save location');
      }

      onSave();
    } catch (error) {
      console.error('Error saving location:', error);
      alert(`Error saving location: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDelete = async () => {
    if (!location || !onDelete) return;
    
    if (confirm(`Are you sure you want to delete "${location.name}"? This action cannot be undone.`)) {
      try {
        const response = await fetch(`/api/locations/${location.id}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const errorData = await response.json();
          const errorMessage = errorData.error || 'Failed to delete location';
          const errorDetails = errorData.details ? '\n\n' + errorData.details.join('\n') : '';
          throw new Error(errorMessage + errorDetails);
        }

        onDelete();
      } catch (error) {
        console.error('Error deleting location:', error);
        const message = error instanceof Error ? error.message : 'Unknown error occurred';
        alert(`Cannot delete location:\n\n${message}`);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>
            <MapPin size={20} />
            {location ? 'Edit Location' : 'Add New Location'}
          </h2>
          <button onClick={onCancel} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="component-form">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Main Workbench, Parts Cabinet A"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Type *</label>
              <select
                className="form-select"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as StorageLocation['type'] })}
                required
              >
                {LOCATION_TYPES.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Parent Location</label>
            <select
              className="form-select"
              value={formData.parentId}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
            >
              <option value="">No Parent (Top Level)</option>
              {parentLocations.map(parent => (
                <option key={parent.id} value={parent.id}>{parent.name}</option>
              ))}
            </select>
            <small className="form-help">Choose where this location is contained</small>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              placeholder="Optional description or notes about this location"
            />
          </div>

          {!location && (
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formData.generateQR}
                  onChange={(e) => setFormData({ ...formData, generateQR: e.target.checked })}
                />
                Generate QR code for this location
              </label>
              <small className="form-help">QR codes help with quick component lookup and organization</small>
            </div>
          )}

          <div className="form-actions">
            {location && onDelete && (
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
              Save Location
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}