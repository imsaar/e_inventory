import { useState, useEffect } from 'react';
import { X, Edit, Trash2, Package, Calendar, Tag, MapPin, DollarSign, Clipboard, ExternalLink, Zap, Cpu, Info, ShoppingCart, ExternalLink as LinkIcon } from 'lucide-react';
import { Component, StorageLocation, ComponentOrder } from '../types';
import { LinkifiedText } from '../utils/linkify';

interface ComponentDetailViewProps {
  componentId: string;
  onClose: () => void;
  onEdit: (component: Component) => void;
  onDelete: (componentId: string) => void;
}

export function ComponentDetailView({ componentId, onClose, onEdit, onDelete }: ComponentDetailViewProps) {
  const [component, setComponent] = useState<Component | null>(null);
  const [location, setLocation] = useState<StorageLocation | null>(null);
  const [orders, setOrders] = useState<ComponentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadComponent();
  }, [componentId]);

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscKey);
    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [onClose]);

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

      // Load location if component has one
      if (componentData.locationId) {
        try {
          const locationResponse = await fetch(`/api/locations/${componentData.locationId}`);
          if (locationResponse.ok) {
            const locationData = await locationResponse.json();
            setLocation(locationData);
          }
        } catch (err) {
          console.warn('Failed to load component location:', err);
        }
      }

      // Load component orders
      try {
        const ordersResponse = await fetch(`/api/components/${componentId}/orders`);
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          setOrders(ordersData);
        }
      } catch (err) {
        console.warn('Failed to load component orders:', err);
      }
    } catch (err) {
      console.error('Error loading component:', err);
      setError(err instanceof Error ? err.message : 'Failed to load component');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      console.log(`${label} copied to clipboard`);
    });
  };

  const getCategoryIcon = (category: string) => {
    const categoryLower = category.toLowerCase();
    if (categoryLower.includes('resistor')) return '🔲';
    if (categoryLower.includes('capacitor')) return '⚡';
    if (categoryLower.includes('ic') || categoryLower.includes('processor') || categoryLower.includes('microcontroller')) return '🧠';
    if (categoryLower.includes('led') || categoryLower.includes('diode')) return '💡';
    if (categoryLower.includes('transistor')) return '🔧';
    if (categoryLower.includes('sensor')) return '👁️';
    if (categoryLower.includes('connector') || categoryLower.includes('header')) return '🔌';
    if (categoryLower.includes('crystal') || categoryLower.includes('oscillator')) return '🔮';
    return '🔧';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'status-available';
      case 'in_use': return 'status-in-use';
      case 'reserved': return 'status-reserved';
      case 'needs_testing': return 'status-needs-testing';
      case 'defective': return 'status-defective';
      default: return 'status-unknown';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
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

  const getOrderStatusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'status-available';
      case 'shipped': return 'status-in-use';
      case 'ordered': return 'status-reserved';
      case 'pending': return 'status-needs-testing';
      case 'cancelled': return 'status-defective';
      default: return 'status-unknown';
    }
  };

  const handleOrderClick = (orderId: string) => {
    // Navigate to order detail - you could implement this with React Router
    // For now, we'll open in a new window/tab or trigger a modal
    window.open(`/orders?orderId=${orderId}`, '_blank');
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
          <div className="component-title">
            <span className="component-icon">{getCategoryIcon(component.category)}</span>
            <div className="title-info">
              <h2>{component.name}</h2>
              {component.partNumber && (
                <span className="part-number">Part #{component.partNumber}</span>
              )}
            </div>
          </div>
          <div className="header-actions">
            <button 
              onClick={() => onEdit(component)} 
              className="btn btn-secondary btn-icon"
              title="Edit Component"
            >
              <Edit size={20} />
            </button>
            <button 
              onClick={() => onDelete(component.id)} 
              className="btn btn-danger btn-icon"
              title="Delete Component"
            >
              <Trash2 size={20} />
            </button>
            <button onClick={onClose} className="btn-icon">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="component-detail-content">
          <div className="detail-main">
            {component.imageUrl && (
              <div className="detail-section">
                <h3><Package size={20} /> Product Image</h3>
                <div className="component-detail-image">
                  <img 
                    src={`/uploads/${component.imageUrl}`} 
                    alt={component.name}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              </div>
            )}

            <div className="detail-section">
              <h3><Package size={20} /> Basic Information</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Category</label>
                  <div className="detail-value">
                    <span className="category-badge">
                      {getCategoryIcon(component.category)} {component.category}
                    </span>
                  </div>
                </div>

                {component.subcategory && (
                  <div className="detail-item">
                    <label>Subcategory</label>
                    <div className="detail-value">{component.subcategory}</div>
                  </div>
                )}

                <div className="detail-item">
                  <label>Status</label>
                  <div className="detail-value">
                    <span className={`status-badge ${getStatusColor(component.status)}`}>
                      {component.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <label>Quantity</label>
                  <div className="detail-value">
                    <span className="quantity-display">
                      {component.quantity}
                      {component.minThreshold && (
                        <span className={`threshold-indicator ${component.quantity <= component.minThreshold ? 'low-stock' : ''}`}>
                          Min: {component.minThreshold}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {component.manufacturer && (
                  <div className="detail-item">
                    <label>Manufacturer</label>
                    <div className="detail-value">
                      {component.manufacturer}
                      {component.partNumber && (
                        <button 
                          className="copy-btn"
                          onClick={() => copyToClipboard(component.partNumber!, 'Part number')}
                          title="Copy part number"
                        >
                          <Clipboard size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {location && (
                  <div className="detail-item">
                    <label>Storage Location</label>
                    <div className="detail-value">
                      <span className="location-link">
                        <MapPin size={14} />
                        {location.name}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(component.unitCost || component.totalCost || component.supplier || component.purchaseDate) && (
              <div className="detail-section">
                <h3><DollarSign size={20} /> Financial Information</h3>
                <div className="detail-grid">
                  {component.unitCost && (
                    <div className="detail-item">
                      <label>Unit Cost</label>
                      <div className="detail-value cost-value">
                        {formatCurrency(component.unitCost)}
                      </div>
                    </div>
                  )}

                  {component.totalCost && (
                    <div className="detail-item">
                      <label>Total Cost</label>
                      <div className="detail-value cost-value">
                        {formatCurrency(component.totalCost)}
                      </div>
                    </div>
                  )}

                  {component.supplier && (
                    <div className="detail-item">
                      <label>Supplier</label>
                      <div className="detail-value">{component.supplier}</div>
                    </div>
                  )}

                  {component.purchaseDate && (
                    <div className="detail-item">
                      <label>Purchase Date</label>
                      <div className="detail-value">
                        {new Date(component.purchaseDate).toLocaleDateString()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(component.voltage || component.current || component.pinCount || component.packageType) && (
              <div className="detail-section">
                <h3><Zap size={20} /> Electrical Specifications</h3>
                <div className="detail-grid">
                  {component.voltage && (
                    <div className="detail-item">
                      <label>Voltage</label>
                      <div className="detail-value">
                        <span className="spec-value">
                          {component.voltage.min && `${component.voltage.min}${component.voltage.unit} - `}
                          {component.voltage.nominal && `${component.voltage.nominal}${component.voltage.unit}`}
                          {component.voltage.max && ` - ${component.voltage.max}${component.voltage.unit}`}
                        </span>
                      </div>
                    </div>
                  )}

                  {component.current && (
                    <div className="detail-item">
                      <label>Current</label>
                      <div className="detail-value">
                        <span className="spec-value">
                          {component.current.value}{component.current.unit}
                        </span>
                      </div>
                    </div>
                  )}

                  {component.pinCount && (
                    <div className="detail-item">
                      <label>Pin Count</label>
                      <div className="detail-value">
                        <span className="spec-value">{component.pinCount} pins</span>
                      </div>
                    </div>
                  )}

                  {component.packageType && (
                    <div className="detail-item">
                      <label>Package</label>
                      <div className="detail-value">
                        <span className="spec-value">{component.packageType}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(component.protocols && component.protocols.length > 0) && (
              <div className="detail-section">
                <h3><Cpu size={20} /> Protocols & Interfaces</h3>
                <div className="protocols-list">
                  {component.protocols.map((protocol, index) => (
                    <span key={index} className="protocol-badge">{protocol}</span>
                  ))}
                </div>
              </div>
            )}

            {component.description && (
              <div className="detail-section">
                <h3><Info size={20} /> Description</h3>
                <div className="description-content">
                  <LinkifiedText>{component.description}</LinkifiedText>
                </div>
              </div>
            )}


            {component.datasheetUrl && (
              <div className="detail-section">
                <h3>Documentation</h3>
                <div className="datasheet-link">
                  <a 
                    href={component.datasheetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="external-link"
                  >
                    <ExternalLink size={16} />
                    View Datasheet
                  </a>
                </div>
              </div>
            )}

            {component.notes && (
              <div className="detail-section">
                <h3>Notes</h3>
                <div className="notes-content">
                  <LinkifiedText>{component.notes}</LinkifiedText>
                </div>
              </div>
            )}

            {component.tags && component.tags.length > 0 && (
              <div className="detail-section">
                <h3><Tag size={20} /> Tags</h3>
                <div className="tags-list">
                  {component.tags.map((tag, index) => (
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
                    {component.createdAt ? formatDate(component.createdAt) : 'N/A'}
                  </div>
                </div>
                <div className="detail-item">
                  <label>Last Updated</label>
                  <div className="detail-value">
                    {component.updatedAt ? formatDate(component.updatedAt) : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {orders.length > 0 && (
              <div className="detail-section">
                <h3><ShoppingCart size={20} /> Associated Orders ({orders.length})</h3>
                <div className="orders-list">
                  {orders.map((order) => (
                    <div key={order.id} className="order-item" onClick={() => handleOrderClick(order.id)}>
                      <div className="order-header">
                        <div className="order-info">
                          <div className="order-number">
                            {order.orderNumber || `Order #${order.id.slice(-8)}`}
                            <LinkIcon size={14} className="order-link-icon" />
                          </div>
                          <div className="order-supplier">
                            {order.supplier || 'Unknown Supplier'}
                          </div>
                        </div>
                        <div className="order-status">
                          <span className={`status-badge ${getOrderStatusColor(order.status)}`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                      <div className="order-details">
                        <div className="order-detail-item">
                          <span className="label">Date:</span>
                          <span className="value">{new Date(order.orderDate).toLocaleDateString()}</span>
                        </div>
                        <div className="order-detail-item">
                          <span className="label">Quantity:</span>
                          <span className="value">{order.componentQuantity} units</span>
                        </div>
                        <div className="order-detail-item">
                          <span className="label">Unit Cost:</span>
                          <span className="value">{formatCurrency(order.componentUnitCost)}</span>
                        </div>
                        <div className="order-detail-item">
                          <span className="label">Total:</span>
                          <span className="value cost-highlight">{formatCurrency(order.componentTotalCost)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="orders-summary">
                  <div className="summary-item">
                    <span className="summary-label">Total Orders:</span>
                    <span className="summary-value">{orders.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Total Quantity:</span>
                    <span className="summary-value">{orders.reduce((sum, order) => sum + order.componentQuantity, 0)} units</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Total Spent:</span>
                    <span className="summary-value cost-highlight">
                      {formatCurrency(orders.reduce((sum, order) => sum + order.componentTotalCost, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="detail-sidebar">
            <div className="actions-section">
              <h3>Quick Actions</h3>
              <div className="quick-actions">
                <button 
                  className="btn btn-secondary"
                  onClick={() => copyToClipboard(component.name, 'Component name')}
                >
                  <Clipboard size={16} />
                  Copy Name
                </button>
                {component.partNumber && (
                  <button 
                    className="btn btn-secondary"
                    onClick={() => copyToClipboard(component.partNumber!, 'Part number')}
                  >
                    <Package size={16} />
                    Copy Part #
                  </button>
                )}
                {component.datasheetUrl && (
                  <a 
                    href={component.datasheetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                  >
                    <ExternalLink size={16} />
                    Open Datasheet
                  </a>
                )}
              </div>
            </div>

            <div className="stats-section">
              <h3>Summary</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{component.quantity}</div>
                  <div className="stat-label">In Stock</div>
                </div>
                {component.unitCost && (
                  <div className="stat-item">
                    <div className="stat-value">{formatCurrency(component.unitCost)}</div>
                    <div className="stat-label">Unit Cost</div>
                  </div>
                )}
                {component.totalCost && (
                  <div className="stat-item">
                    <div className="stat-value">{formatCurrency(component.totalCost)}</div>
                    <div className="stat-label">Total Value</div>
                  </div>
                )}
              </div>
            </div>

            {(component.quantity <= (component.minThreshold || 0) && component.minThreshold) && (
              <div className="alert-section">
                <div className="low-stock-alert">
                  <strong>⚠️ Low Stock Alert</strong>
                  <p>Quantity ({component.quantity}) is at or below minimum threshold ({component.minThreshold})</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}