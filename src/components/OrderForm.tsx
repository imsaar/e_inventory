import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Search, Package } from 'lucide-react';
import { Component, Order } from '../types';

interface OrderItem {
  id: string;
  componentId: string;
  componentName: string;
  componentPartNumber?: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
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
        orderDate: orderData.orderDate,
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
        totalCost: item.unitCost * item.quantity
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

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create order');
      }

      onSave();
    } catch (error) {
      console.error('Error creating order:', error);
      alert('Failed to create order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal modal-large">
        <div className="modal-header">
          <h2>{order ? 'Edit Order' : 'Create New Order'}</h2>
          <button className="btn-icon" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
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
                  
                  {items.map((item, index) => (
                    <div key={item.id} className="table-row">
                      <div className="table-cell">
                        {item.componentId ? (
                          <div className="component-info">
                            <span className="component-name">{item.componentName}</span>
                            {item.componentPartNumber && (
                              <span className="component-part">{item.componentPartNumber}</span>
                            )}
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
                  ))}
                </div>
              )}

              {items.length > 0 && (
                <div className="order-total">
                  <strong>Total Order Value: ${calculateTotalAmount().toFixed(2)}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
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