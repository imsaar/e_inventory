import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, Package, ExternalLink, RefreshCw } from 'lucide-react';
import { Component, Order } from '../types';
import { resolveOrderItemImage } from '../utils/orderItemImage';

const PLACEHOLDER_TITLE_PATTERN = /^AliExpress item \d+/i;

interface OrderItem {
  id: string;
  componentId: string;
  componentName: string;
  componentPartNumber?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  productTitle?: string;
  productUrl?: string;
  imageUrl?: string;
  localImagePath?: string;
  componentImageUrl?: string;
}

interface OrderFormProps {
  order?: Order | null;
  onSave: () => void;
  onCancel: () => void;
}

export function OrderForm({ order, onSave, onCancel }: OrderFormProps) {
  const [formData, setFormData] = useState({
    orderDate: new Date().toISOString().split('T')[0],
    supplier: '',
    orderNumber: '',
    notes: '',
    status: 'delivered' as 'pending' | 'ordered' | 'shipped' | 'delivered' | 'cancelled'
  });

  const [items, setItems] = useState<OrderItem[]>([]);
  const [components, setComponents] = useState<Component[]>([]);
  const [filteredComponents, setFilteredComponents] = useState<Component[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showComponentSelector, setShowComponentSelector] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(false);
  const [componentsLoading, setComponentsLoading] = useState(true);
  const [fetchingTitleId, setFetchingTitleId] = useState<string | null>(null);
  const [fetchTitleErrors, setFetchTitleErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadComponents();
    if (order) {
      loadOrderForEditing();
    }
  }, [order]);

  const loadOrderForEditing = async () => {
    if (!order) return;
    
    try {
      const response = await fetch(`/api/orders/${order.id}`);
      const orderData = await response.json();
      
      setFormData({
        orderDate: orderData.orderDate ? new Date(orderData.orderDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        supplier: orderData.supplier || '',
        orderNumber: orderData.orderNumber || '',
        notes: orderData.notes || '',
        status: orderData.status
      });

      // Convert order items to form format
      const formItems: OrderItem[] = orderData.items.map((item: any) => ({
        id: item.id,
        componentId: item.componentId,
        componentName: item.componentName,
        componentPartNumber: item.componentPartNumber,
        quantity: item.quantity,
        unitCost: item.unitCost,
        totalCost: item.unitCost * item.quantity,
        productTitle: item.productTitle,
        productUrl: item.productUrl,
        imageUrl: item.imageUrl,
        localImagePath: item.localImagePath,
        componentImageUrl: item.componentImageUrl,
      }));
      setItems(formItems);
    } catch (error) {
      console.error('Error loading order for editing:', error);
      alert('Failed to load order details for editing');
    }
  };

  useEffect(() => {
    if (searchTerm) {
      const filtered = components.filter(comp =>
        comp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (comp.partNumber && comp.partNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        comp.category.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredComponents(filtered);
    } else {
      setFilteredComponents(components);
    }
  }, [searchTerm, components]);

  const loadComponents = async () => {
    try {
      setComponentsLoading(true);
      const response = await fetch('/api/components');
      const data = await response.json();
      setComponents(data);
      setFilteredComponents(data);
    } catch (error) {
      console.error('Error loading components:', error);
    } finally {
      setComponentsLoading(false);
    }
  };

  const addNewItem = () => {
    const newItem: OrderItem = {
      id: Date.now().toString(),
      componentId: '',
      componentName: '',
      quantity: 1,
      unitCost: 0,
      totalCost: 0
    };
    setItems([...items, newItem]);
    setSelectedItemIndex(items.length);
    setShowComponentSelector(true);
    setSearchTerm('');
  };

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  // Fetch the real product title from AliExpress for a placeholder item.
  // Updates the linked component name + the order item's product_title server-side,
  // then reflects the new title in local form state. Failures (anti-bot blocks,
  // timeouts) are surfaced inline next to the row.
  const handleFetchTitle = async (item: OrderItem, index: number) => {
    if (!item.productUrl) return;
    setFetchingTitleId(item.id);
    setFetchTitleErrors(prev => {
      const { [item.id]: _, ...rest } = prev;
      return rest;
    });
    try {
      const response = await fetch('/api/import/aliexpress/fetch-title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productUrl: item.productUrl,
          componentId: item.componentId || undefined,
          orderItemId: item.id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Request failed with ${response.status}`);
      }
      const newItems = [...items];
      newItems[index] = {
        ...newItems[index],
        componentName: data.title,
        productTitle: data.title,
      };
      setItems(newItems);
    } catch (err) {
      setFetchTitleErrors(prev => ({
        ...prev,
        [item.id]: err instanceof Error ? err.message : 'Failed to fetch title',
      }));
    } finally {
      setFetchingTitleId(null);
    }
  };

  const selectComponent = (component: Component, itemIndex: number) => {
    const newItems = [...items];
    newItems[itemIndex] = {
      ...newItems[itemIndex],
      componentId: component.id,
      componentName: component.name,
      componentPartNumber: component.partNumber,
      unitCost: component.unitCost || 0
    };
    // Recalculate total cost
    newItems[itemIndex].totalCost = newItems[itemIndex].quantity * newItems[itemIndex].unitCost;
    setItems(newItems);
    setShowComponentSelector(false);
    setSelectedItemIndex(-1);
    setSearchTerm('');
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    const newItems = [...items];
    newItems[index].quantity = Math.max(1, quantity);
    newItems[index].totalCost = newItems[index].quantity * newItems[index].unitCost;
    setItems(newItems);
  };

  const updateItemUnitCost = (index: number, unitCost: number) => {
    const newItems = [...items];
    newItems[index].unitCost = Math.max(0, unitCost);
    newItems[index].totalCost = newItems[index].quantity * newItems[index].unitCost;
    setItems(newItems);
  };

  const calculateTotalAmount = () => {
    return items.reduce((sum, item) => sum + item.totalCost, 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (items.length === 0) {
      alert('Please add at least one component to the order.');
      return;
    }

    if (items.some(item => !item.componentId)) {
      alert('Please select components for all items.');
      return;
    }

    try {
      setLoading(true);

      const orderData = {
        ...formData,
        totalAmount: calculateTotalAmount(),
        items: items.map(item => ({
          componentId: item.componentId,
          quantity: item.quantity,
          unitCost: item.unitCost,
          notes: ''
        }))
      };

      const url = order ? `/api/orders/${order.id}` : '/api/orders';
      const method = order ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to ${order ? 'update' : 'create'} order`);
      }

      onSave();
    } catch (error) {
      console.error('Error creating order:', error);
      alert(`Failed to ${order ? 'update' : 'create'} order. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-large" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>{order ? 'Edit Order' : 'Create New Order'}</h2>
          <button className="btn-icon" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="orderDate">Order Date *</label>
                <input
                  id="orderDate"
                  type="date"
                  value={formData.orderDate}
                  onChange={(e) => setFormData({ ...formData, orderDate: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="supplier">Supplier</label>
                <input
                  id="supplier"
                  type="text"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="Enter supplier name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="orderNumber">Order Number</label>
                <input
                  id="orderNumber"
                  type="text"
                  value={formData.orderNumber}
                  onChange={(e) => setFormData({ ...formData, orderNumber: e.target.value })}
                  placeholder="Enter order number"
                />
              </div>

              <div className="form-group">
                <label htmlFor="status">Status</label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                >
                  <option value="pending">Pending</option>
                  <option value="ordered">Ordered</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Enter any additional notes"
                rows={3}
              />
            </div>

            <div className="order-items-section">
              <div className="section-header">
                <h3>Order Items</h3>
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={addNewItem}
                  disabled={componentsLoading}
                >
                  <Plus size={16} />
                  Add Component
                </button>
              </div>

              {items.length === 0 ? (
                <div className="empty-items">
                  <Package size={32} />
                  <p>No components added yet</p>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={addNewItem}
                    disabled={componentsLoading}
                  >
                    <Plus size={16} />
                    Add First Component
                  </button>
                </div>
              ) : (
                <div className="order-items-table">
                  <div className="table-header">
                    <div className="table-cell">Component</div>
                    <div className="table-cell">Quantity</div>
                    <div className="table-cell">Unit Cost</div>
                    <div className="table-cell">Total</div>
                    <div className="table-cell">Actions</div>
                  </div>
                  
                  {items.map((item, index) => {
                    const imageUrl = resolveOrderItemImage(item);
                    const displayName = item.productTitle || item.componentName;
                    return (
                    <div key={item.id} className="table-row">
                      <div className="table-cell">
                        {item.componentId ? (
                          <div className="order-form-component-cell">
                            {imageUrl ? (
                              <img
                                src={imageUrl}
                                alt={displayName}
                                className="order-item-thumbnail"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="order-item-thumbnail order-item-thumbnail-empty">
                                <Package size={20} />
                              </div>
                            )}
                            <div className="component-info">
                              {item.productUrl ? (
                                <a
                                  href={item.productUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="component-name component-name-link"
                                  title="View on AliExpress"
                                >
                                  {displayName}
                                  <ExternalLink size={12} />
                                </a>
                              ) : (
                                <span className="component-name">{displayName}</span>
                              )}
                              {item.componentPartNumber && (
                                <span className="component-part">{item.componentPartNumber}</span>
                              )}
                              {item.productUrl && PLACEHOLDER_TITLE_PATTERN.test(displayName) && (
                                <button
                                  type="button"
                                  className="fetch-title-btn"
                                  onClick={() => handleFetchTitle(item, index)}
                                  disabled={fetchingTitleId === item.id}
                                  title="Fetch product title from AliExpress"
                                >
                                  <RefreshCw
                                    size={12}
                                    className={fetchingTitleId === item.id ? 'spin' : ''}
                                  />
                                  {fetchingTitleId === item.id ? 'Fetching…' : 'Fetch title'}
                                </button>
                              )}
                              {fetchTitleErrors[item.id] && (
                                <span className="fetch-title-error">{fetchTitleErrors[item.id]}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-small"
                            onClick={() => {
                              setSelectedItemIndex(index);
                              setShowComponentSelector(true);
                              setSearchTerm('');
                            }}
                            disabled={componentsLoading}
                          >
                            {componentsLoading ? 'Loading...' : 'Select Component'}
                          </button>
                        )}
                      </div>
                      
                      <div className="table-cell">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItemQuantity(index, parseInt(e.target.value) || 1)}
                          className="quantity-input"
                        />
                      </div>
                      
                      <div className="table-cell">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) => updateItemUnitCost(index, parseFloat(e.target.value) || 0)}
                          className="cost-input"
                        />
                      </div>
                      
                      <div className="table-cell">
                        ${item.totalCost.toFixed(2)}
                      </div>
                      
                      <div className="table-cell">
                        <button
                          type="button"
                          className="btn-icon btn-danger"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {items.length > 0 && (
                <div className="order-total">
                  <strong>Total Order Value: ${calculateTotalAmount().toFixed(2)}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer" style={{ flexShrink: 0 }}>
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={loading || items.length === 0}
            >
{loading 
                ? (order ? 'Updating Order...' : 'Creating Order...') 
                : (order ? 'Update Order' : 'Create Order')
              }
            </button>
          </div>
        </form>

        {showComponentSelector && (
          <div className="component-selector-overlay">
            <div className="component-selector">
              <div className="selector-header">
                <h3>Select Component</h3>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={() => {
                    setShowComponentSelector(false);
                    setSelectedItemIndex(-1);
                    setSearchTerm('');
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="selector-search">
                <div className="search-input-group">
                  <Search size={20} />
                  <input
                    type="text"
                    placeholder="Search components..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              <div className="selector-list">
                {filteredComponents.length === 0 ? (
                  <div className="empty-results">
                    {componentsLoading ? 'Loading components...' : 'No components found'}
                  </div>
                ) : (
                  filteredComponents.map((component) => (
                    <div
                      key={component.id}
                      className="component-option"
                      onClick={() => selectComponent(component, selectedItemIndex)}
                    >
                      <div className="component-main">
                        <span className="component-name">{component.name}</span>
                        <span className="component-category">{component.category}</span>
                      </div>
                      <div className="component-details">
                        {component.partNumber && (
                          <span className="component-part">P/N: {component.partNumber}</span>
                        )}
                        {component.unitCost && (
                          <span className="component-cost">${component.unitCost.toFixed(2)}</span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}