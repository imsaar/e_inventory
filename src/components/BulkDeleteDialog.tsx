import { useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';

interface BulkDeleteDialogProps {
  items: string[]; // Array of IDs to delete
  itemType: 'locations' | 'components' | 'projects';
  onCancel: () => void;
  onConfirm: (results: any) => void;
}

export function BulkDeleteDialog({ items, itemType, onCancel, onConfirm }: BulkDeleteDialogProps) {
  const [loading, setLoading] = useState(false);

  const getApiEndpoint = () => {
    switch (itemType) {
      case 'locations': return '/api/locations';
      case 'components': return '/api/components';
      case 'projects': return '/api/projects';
      default: throw new Error(`Unknown item type: ${itemType}`);
    }
  };


  const performBulkDelete = async () => {
    try {
      setLoading(true);
      
      const endpoint = getApiEndpoint();
      const paramName = itemType === 'locations' ? 'locationIds' : 
                       itemType === 'components' ? 'componentIds' : 'projectIds';
      
      const response = await fetch(`${endpoint}/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [paramName]: items })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete items');
      }

      const results = await response.json();
      onConfirm(results);

    } catch (error) {
      console.error('Error deleting items:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`Error deleting ${itemType}: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>
            <Trash2 size={20} />
            Delete {items.length} {itemType}
          </h2>
          <button onClick={onCancel} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="confirmation-message">
            <AlertTriangle size={48} style={{ color: '#f59e0b', marginBottom: '16px' }} />
            <h3>Are you sure you want to delete {items.length} {itemType}?</h3>
            <p>This action cannot be undone. If any {itemType} have dependencies (like components in a location), the deletion may fail and you'll need to handle those dependencies first.</p>
          </div>

          {loading && (
            <div className="loading-section">
              <div className="loading-spinner"></div>
              <p>Deleting {itemType}...</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button 
            type="button" 
            onClick={onCancel} 
            className="btn btn-secondary"
            disabled={loading}
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={performBulkDelete}
            className="btn btn-danger"
            disabled={loading}
          >
            <Trash2 size={16} />
            {loading ? 'Deleting...' : `Delete ${items.length} ${itemType}`}
          </button>
        </div>
      </div>
    </div>
  );
}