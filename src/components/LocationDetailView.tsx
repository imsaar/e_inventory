import { useState, useEffect } from 'react';
import { X, Edit, Trash2, MapPin, Package, Calendar, Tag, QrCode, Clipboard, Image as ImageIcon, Eye, Archive, Home, Building, FolderOpen, Box, Layers } from 'lucide-react';
import { StorageLocation, Component } from '../types';
import { LinkifiedText } from '../utils/linkify';

interface LocationDetailViewProps {
  locationId: string;
  onClose: () => void;
  onEdit: (location: StorageLocation) => void;
  onDelete: (locationId: string) => void;
}

export function LocationDetailView({ locationId, onClose, onEdit, onDelete }: LocationDetailViewProps) {
  const [location, setLocation] = useState<StorageLocation | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [children, setChildren] = useState<StorageLocation[]>([]);
  const [parentPath, setParentPath] = useState<StorageLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLocation();
  }, [locationId]);

  const loadLocation = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load location details
      const response = await fetch(`/api/locations/${locationId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Location not found');
        }
        throw new Error('Failed to load location');
      }
      
      const locationData = await response.json();
      setLocation(locationData);

      // Load components in this location
      const componentsResponse = await fetch(`/api/components?locationId=${locationId}`);
      if (componentsResponse.ok) {
        const componentsData = await componentsResponse.json();
        setComponents(componentsData);
      }

      // Load child locations
      const childrenResponse = await fetch(`/api/locations?parentId=${locationId}`);
      if (childrenResponse.ok) {
        const childrenData = await childrenResponse.json();
        setChildren(childrenData);
      }

      // Build parent path if location has a parent
      if (locationData.parentId) {
        await buildParentPath(locationData.parentId);
      }
    } catch (err) {
      console.error('Error loading location:', err);
      setError(err instanceof Error ? err.message : 'Failed to load location');
    } finally {
      setLoading(false);
    }
  };

  const buildParentPath = async (parentId: string) => {
    try {
      const path: StorageLocation[] = [];
      let currentParentId = parentId;

      while (currentParentId) {
        const parentResponse = await fetch(`/api/locations/${currentParentId}`);
        if (!parentResponse.ok) break;
        
        const parentData = await parentResponse.json();
        path.unshift(parentData);
        currentParentId = parentData.parentId;
      }

      setParentPath(path);
    } catch (err) {
      console.error('Error building parent path:', err);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log(`${label} copied to clipboard`);
    });
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'room': return <Home size={20} className="type-icon" />;
      case 'cabinet': return <Archive size={20} className="type-icon" />;
      case 'shelf': return <Layers size={20} className="type-icon" />;
      case 'drawer': return <FolderOpen size={20} className="type-icon" />;
      case 'box': return <Box size={20} className="type-icon" />;
      case 'bin': return <Package size={20} className="type-icon" />;
      default: return <Building size={20} className="type-icon" />;
    }
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case 'room': return '🏠';
      case 'cabinet': return '🗄️';
      case 'shelf': return '📚';
      case 'drawer': return '📦';
      case 'box': return '📦';
      case 'bin': return '🗂️';
      default: return '📍';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getQRSizeDisplay = (size: string) => {
    switch (size) {
      case 'small': return { label: 'Small', description: 'Good for small containers' };
      case 'medium': return { label: 'Medium', description: 'Default size for most locations' };
      case 'large': return { label: 'Large', description: 'Good for main areas and walls' };
      default: return { label: 'Medium', description: 'Default size for most locations' };
    }
  };

  const getTotalComponents = () => {
    return components.length;
  };

  const getTotalQuantity = () => {
    return components.reduce((total, comp) => total + comp.quantity, 0);
  };

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="loading">Loading location details...</div>
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

  if (!location) {
    return null;
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content large">
        <div className="modal-header">
          <div className="location-title">
            <div className="location-icon-wrapper">
              {getTypeIcon(location.type)}
              <span className="location-emoji">{getTypeEmoji(location.type)}</span>
            </div>
            <div className="title-info">
              <h2>{location.name}</h2>
              <span className="location-type-label">{location.type.charAt(0).toUpperCase() + location.type.slice(1)}</span>
            </div>
          </div>
          <div className="header-actions">
            <button 
              onClick={() => onEdit(location)} 
              className="btn btn-secondary btn-icon"
              title="Edit Location"
            >
              <Edit size={20} />
            </button>
            <button 
              onClick={() => onDelete(location.id)} 
              className="btn btn-danger btn-icon"
              title="Delete Location"
            >
              <Trash2 size={20} />
            </button>
            <button onClick={onClose} className="btn-icon">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="location-detail-content">
          <div className="detail-main">
            {parentPath.length > 0 && (
              <div className="detail-section">
                <h3><MapPin size={20} /> Location Path</h3>
                <div className="breadcrumb">
                  {parentPath.map((parent, index) => (
                    <span key={parent.id}>
                      <span className="breadcrumb-item">
                        <span className="breadcrumb-icon">{getTypeEmoji(parent.type)}</span>
                        {parent.name}
                      </span>
                      {index < parentPath.length - 1 && <span className="breadcrumb-separator"> → </span>}
                    </span>
                  ))}
                  <span className="breadcrumb-separator"> → </span>
                  <span className="breadcrumb-current">
                    <span className="breadcrumb-icon">{getTypeEmoji(location.type)}</span>
                    {location.name}
                  </span>
                </div>
              </div>
            )}

            <div className="detail-section">
              <h3><Archive size={20} /> Basic Information</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Type</label>
                  <div className="detail-value">
                    <span className="location-type-badge">
                      {getTypeIcon(location.type)}
                      <span className="type-text">
                        {location.type.charAt(0).toUpperCase() + location.type.slice(1)}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <label>QR Code</label>
                  <div className="detail-value">
                    {location.qrCode ? (
                      <div className="qr-code-display">
                        <QrCode size={16} />
                        <span className="qr-code-text">{location.qrCode}</span>
                        <button 
                          className="copy-btn"
                          onClick={() => copyToClipboard(location.qrCode!, 'QR Code')}
                          title="Copy to clipboard"
                        >
                          <Clipboard size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted">
                        <QrCode size={16} className="muted-icon" />
                        Not assigned
                      </span>
                    )}
                  </div>
                </div>

                <div className="detail-item">
                  <label>QR Print Size</label>
                  <div className="detail-value">
                    <span className="qr-size-indicator">
                      <span className="size-label">{getQRSizeDisplay(location.qrSize || 'medium').label}</span>
                      <span className="size-description">{getQRSizeDisplay(location.qrSize || 'medium').description}</span>
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <label>Components</label>
                  <div className="detail-value">
                    <span className="stat-display">
                      <Package size={16} />
                      <span className="stat-text">
                        {getTotalComponents()} types ({getTotalQuantity()} total items)
                      </span>
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <label>Sub-locations</label>
                  <div className="detail-value">
                    <span className="stat-display">
                      <FolderOpen size={16} />
                      <span className="stat-text">{children.length} child locations</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {location.description && (
              <div className="detail-section">
                <h3><Eye size={20} /> Description</h3>
                <div className="description-content">
                  <LinkifiedText>{location.description}</LinkifiedText>
                </div>
              </div>
            )}

            {location.photoUrl && (
              <div className="detail-section">
                <h3><ImageIcon size={20} /> Location Photo</h3>
                <div className="location-photo">
                  <div className="photo-container">
                    <img 
                      src={location.photoUrl} 
                      alt={`Photo of ${location.name}`}
                      className="detail-photo"
                      onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        img.style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {children.length > 0 && (
              <div className="detail-section">
                <h3><FolderOpen size={20} /> Child Locations</h3>
                <div className="children-list">
                  {children.map((child) => (
                    <div key={child.id} className="child-location">
                      <div className="child-header">
                        <div className="child-info">
                          <span className="child-icon">{getTypeEmoji(child.type)}</span>
                          <span className="child-name">{child.name}</span>
                          <span className="child-type">({child.type})</span>
                        </div>
                        <div className="child-meta">
                          {child.qrCode && (
                            <span className="child-qr">
                              <QrCode size={12} />
                              {child.qrCode}
                            </span>
                          )}
                          <span className="child-qr-size">
                            Size: {getQRSizeDisplay(child.qrSize || 'medium').label}
                          </span>
                        </div>
                      </div>
                      {child.description && (
                        <div className="child-description">
                          <LinkifiedText>{child.description}</LinkifiedText>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {components.length > 0 && (
              <div className="detail-section">
                <h3><Package size={20} /> Components in this Location</h3>
                <div className="components-list">
                  {components.map((component) => (
                    <div key={component.id} className="component-summary">
                      <div className="component-main">
                        <div className="component-header">
                          <div className="component-name">{component.name}</div>
                          {component.unitCost && (
                            <div className="component-cost">
                              ${component.unitCost.toFixed(2)} each
                            </div>
                          )}
                        </div>
                        <div className="component-details">
                          {component.partNumber && (
                            <span className="part-number">
                              <Package size={12} />
                              {component.partNumber}
                            </span>
                          )}
                          <span className="category">
                            {component.category}
                            {component.subcategory && <span className="subcategory">/ {component.subcategory}</span>}
                          </span>
                          {component.manufacturer && (
                            <span className="manufacturer">{component.manufacturer}</span>
                          )}
                        </div>
                      </div>
                      <div className="component-metrics">
                        <span className={`quantity-badge ${component.quantity <= (component.minThreshold || 0) && component.minThreshold ? 'low-stock' : ''}`}>
                          {component.quantity} in stock
                          {component.minThreshold && component.quantity <= component.minThreshold && (
                            <span className="low-stock-warning">⚠️ Low</span>
                          )}
                        </span>
                        <span className={`status-badge status-${component.status}`}>
                          {component.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {location.tags && location.tags.length > 0 && (
              <div className="detail-section">
                <h3><Tag size={20} /> Tags</h3>
                <div className="tags-list">
                  {location.tags.map((tag, index) => (
                    <span key={index} className="tag">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="detail-section">
              <h3><Calendar size={20} /> History</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Created</label>
                  <div className="detail-value">
                    <span className="timestamp">
                      {location.createdAt ? formatDate(location.createdAt) : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="detail-item">
                  <label>Last Updated</label>
                  <div className="detail-value">
                    <span className="timestamp">
                      {location.updatedAt ? formatDate(location.updatedAt) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="detail-sidebar">
            <div className="actions-section">
              <h3>Quick Actions</h3>
              <div className="quick-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={() => copyToClipboard(location.name, 'Location name')}
                >
                  <Clipboard size={16} />
                  Copy Name
                </button>
                {location.qrCode && (
                  <button 
                    className="btn btn-secondary"
                    onClick={() => copyToClipboard(location.qrCode!, 'QR Code')}
                  >
                    <QrCode size={16} />
                    Copy QR Code
                  </button>
                )}
                <button className="btn btn-secondary">
                  <QrCode size={16} />
                  Print QR Label
                </button>
              </div>
            </div>

            <div className="stats-section">
              <h3>Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{getTotalComponents()}</div>
                  <div className="stat-label">Component Types</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{getTotalQuantity()}</div>
                  <div className="stat-label">Total Items</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{children.length}</div>
                  <div className="stat-label">Sub-locations</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}