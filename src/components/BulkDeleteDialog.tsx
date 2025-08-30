import { useState } from 'react';
import { X, AlertTriangle, Check, Trash2, Package, MapPin, Briefcase } from 'lucide-react';

interface Dependency {
  type: string;
  count: number;
  items: string[];
}

interface ItemDependency {
  id: string;
  name: string;
  canDelete: boolean;
  dependencies: Dependency[];
  error?: string;
}

interface BulkDeleteDialogProps {
  items: string[]; // Array of IDs to delete
  itemType: 'locations' | 'components' | 'projects';
  onCancel: () => void;
  onConfirm: (results: any) => void;
}

export function BulkDeleteDialog({ items, itemType, onCancel, onConfirm }: BulkDeleteDialogProps) {
  const [loading, setLoading] = useState(false);
  const [dependencies, setDependencies] = useState<ItemDependency[]>([]);
  const [showDependencies, setShowDependencies] = useState(false);
  const [step, setStep] = useState<'checking' | 'review' | 'processing' | 'completed'>('checking');

  const getApiEndpoint = () => {
    switch (itemType) {
      case 'locations': return '/api/locations';
      case 'components': return '/api/components';
      case 'projects': return '/api/projects';
      default: throw new Error(`Unknown item type: ${itemType}`);
    }
  };

  const getItemIcon = () => {
    switch (itemType) {
      case 'locations': return <MapPin size={20} />;
      case 'components': return <Package size={20} />;
      case 'projects': return <Briefcase size={20} />;
    }
  };

  const getDependencyIcon = (type: string) => {
    switch (type) {
      case 'components': return <Package size={16} />;
      case 'child_locations': return <MapPin size={16} />;
      case 'projects': return <Briefcase size={16} />;
      case 'boms': return <Briefcase size={16} />;
      default: return <AlertTriangle size={16} />;
    }
  };

  const getDependencyLabel = (type: string) => {
    switch (type) {
      case 'components': return 'Components';
      case 'child_locations': return 'Child Locations';
      case 'projects': return 'Projects';
      case 'boms': return 'BOMs';
      default: return 'Dependencies';
    }
  };

  const checkDependencies = async () => {
    try {
      setLoading(true);
      const endpoint = getApiEndpoint();
      const paramName = itemType === 'locations' ? 'locationIds' : 
                       itemType === 'components' ? 'componentIds' : 'projectIds';
      
      const response = await fetch(`${endpoint}/check-dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [paramName]: items })
      });

      if (!response.ok) {
        throw new Error('Failed to check dependencies');
      }

      const data = await response.json();
      setDependencies(data);
      setStep('review');
    } catch (error) {
      console.error('Error checking dependencies:', error);
      alert('Failed to check dependencies. Please try again.');
      onCancel();
    } finally {
      setLoading(false);
    }
  };

  const performBulkDelete = async () => {
    try {
      setLoading(true);
      setStep('processing');
      
      const endpoint = getApiEndpoint();
      const paramName = itemType === 'locations' ? 'locationIds' : 
                       itemType === 'components' ? 'componentIds' : 'projectIds';
      
      const response = await fetch(`${endpoint}/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [paramName]: items })
      });

      if (!response.ok) {
        throw new Error('Failed to delete items');
      }

      const results = await response.json();
      setStep('completed');
      setTimeout(() => {
        onConfirm(results);
      }, 2000);

    } catch (error) {
      console.error('Error deleting items:', error);
      alert('Failed to delete items. Please try again.');
      onCancel();
    } finally {
      setLoading(false);
    }
  };

  // Auto-check dependencies when dialog opens
  useState(() => {
    checkDependencies();
  });

  const canProceed = dependencies.length > 0 && dependencies.every(item => item.canDelete);
  const hasBlockedItems = dependencies.some(item => !item.canDelete);
  const blockedCount = dependencies.filter(item => !item.canDelete).length;
  const deleteableCount = dependencies.filter(item => item.canDelete).length;

  return (
    <div className="modal-overlay">
      <div className="modal-content bulk-delete-modal">
        <div className="modal-header">
          <h2>
            <Trash2 size={20} />
            Delete {items.length} {itemType}
          </h2>
          <button onClick={onCancel} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        {step === 'checking' && (
          <div className="modal-body text-center">
            <div className="loading-spinner"></div>
            <p>Checking dependencies...</p>
          </div>
        )}

        {step === 'review' && (
          <div className="modal-body">
            <div className="bulk-delete-summary">
              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-number">{items.length}</span>
                  <span className="stat-label">Selected</span>
                </div>
                {deleteableCount > 0 && (
                  <div className="stat success">
                    <span className="stat-number">{deleteableCount}</span>
                    <span className="stat-label">Can Delete</span>
                  </div>
                )}
                {blockedCount > 0 && (
                  <div className="stat error">
                    <span className="stat-number">{blockedCount}</span>
                    <span className="stat-label">Blocked</span>
                  </div>
                )}
              </div>

              {hasBlockedItems && (
                <div className="dependency-warning">
                  <AlertTriangle size={20} />
                  <div>
                    <strong>{blockedCount} items cannot be deleted</strong>
                    <p>These items have dependencies that must be removed first.</p>
                  </div>
                </div>
              )}

              <div className="dependency-list">
                {dependencies.map(item => (
                  <div key={item.id} className={`dependency-item ${item.canDelete ? 'can-delete' : 'blocked'}`}>
                    <div className="dependency-header">
                      <div className="dependency-info">
                        {getItemIcon()}
                        <span className="dependency-name">{item.name}</span>
                        {item.canDelete ? (
                          <span className="status-badge success">
                            <Check size={12} />
                            Can Delete
                          </span>
                        ) : (
                          <span className="status-badge error">
                            <AlertTriangle size={12} />
                            Blocked
                          </span>
                        )}
                      </div>
                    </div>

                    {!item.canDelete && item.dependencies.length > 0 && (
                      <div className="dependency-details">
                        {item.dependencies.map((dep, index) => (
                          <div key={index} className="dependency-group">
                            <div className="dependency-type">
                              {getDependencyIcon(dep.type)}
                              <span>{getDependencyLabel(dep.type)} ({dep.count})</span>
                            </div>
                            {dep.items.length > 0 && (
                              <div className="dependency-items">
                                {dep.items.slice(0, 3).map(depItem => (
                                  <span key={depItem} className="dependency-tag">{depItem}</span>
                                ))}
                                {dep.items.length > 3 && (
                                  <span className="dependency-tag more">
                                    +{dep.items.length - 3} more
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 'processing' && (
          <div className="modal-body text-center">
            <div className="loading-spinner"></div>
            <p>Deleting items...</p>
          </div>
        )}

        {step === 'completed' && (
          <div className="modal-body text-center">
            <div className="success-icon">
              <Check size={48} />
            </div>
            <h3>Deletion Complete</h3>
            <p>Items have been successfully deleted.</p>
          </div>
        )}

        {step === 'review' && (
          <div className="modal-footer">
            <button 
              type="button" 
              onClick={onCancel} 
              className="btn btn-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            
            {deleteableCount > 0 && (
              <button 
                type="button"
                onClick={performBulkDelete}
                className="btn btn-danger"
                disabled={loading}
              >
                <Trash2 size={16} />
                Delete {deleteableCount} {itemType}
                {hasBlockedItems && ` (${blockedCount} will be skipped)`}
              </button>
            )}

            {deleteableCount === 0 && (
              <button 
                type="button" 
                onClick={onCancel} 
                className="btn btn-primary"
                disabled={loading}
              >
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}