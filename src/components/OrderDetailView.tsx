import { useEffect, useState } from 'react';
import { X, Package, Calendar, DollarSign, User, FileText, Hash, Edit, Trash2 } from 'lucide-react';
import { Order } from '../types';
import { resolveOrderItemImage } from '../utils/orderItemImage';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useEditShortcut } from '../hooks/useEditShortcut';

interface OrderItem {
  id: string;
  componentId: string;
  componentName: string;
  componentPartNumber?: string;
  quantity: number;
  unitCost: number;
  listUnitCost?: number | null;
  packSize?: number;
  totalCost: number;
  notes?: string;
  productTitle?: string;
  productUrl?: string;
  imageUrl?: string;
  localImagePath?: string;
  componentImageUrl?: string;
  variation?: string;
}


interface OrderWithItems extends Order {
  items: OrderItem[];
}

interface OrderDetailViewProps {
  orderId: string;
  onClose: () => void;
  onEdit?: (order: Order) => void;
  onDelete?: (orderId: string) => void;
}

export function OrderDetailView({ orderId, onClose, onEdit, onDelete }: OrderDetailViewProps) {
  useEscapeKey(onClose);

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOrderDetails();
  }, [orderId]);

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/orders/${orderId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load order details');
      }
      
      const data = await response.json();
      setOrder(data);
    } catch (error) {
      console.error('Error loading order details:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    if (order && onEdit) {
      onEdit(order);
    }
  };

  // Pressing 'e' in the detail view jumps into edit mode. Disabled until
  // the order has loaded and an onEdit callback is wired up.
  useEditShortcut(handleEdit, !!(order && onEdit));

  const handleDelete = async () => {
    if (!order || !onDelete) return;
    
    if (confirm(`Are you sure you want to delete order "${order.orderNumber || order.id}"? This will also reverse the inventory quantity changes.`)) {
      onDelete(order.id);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Order status colors come from App.css .status-{status} classes so the
  // detail modal matches Dashboard / Orders list / detail badges exactly.

  if (loading) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="loading">Loading order details...</div>
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
          <div className="modal-body">
            <div className="error-message">
              <p>Failed to load order details: {error}</p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2>Order Not Found</h2>
            <button onClick={onClose} className="btn-icon">
              <X size={20} />
            </button>
          </div>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  const itemsSubtotal = order.items.reduce((sum, item) => sum + (item.unitCost * item.quantity), 0);
  const taxAmount = order.tax || 0;
  // Total = items (post-discount) + tax. Matches orders.total_amount for
  // imported orders; diverges only if the user manually edited line items
  // after import, in which case the displayed breakdown wins.
  const displayTotal = itemsSubtotal + taxAmount;

  return (
    <div className="modal-overlay">
      <div className="modal-content modal-large">
        <div className="modal-header">
          <h2>
            <Package size={24} />
            Order Details: {order.orderNumber || `#${order.id.slice(-8)}`}
          </h2>
          <button onClick={onClose} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="detail-view-layout">
            {/* Order Information */}
            <div className="detail-section">
              <h3 className="detail-section-title">Order Information</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <div className="detail-label">
                    <Calendar size={16} />
                    Order Date
                  </div>
                  <div className="detail-value">{formatDate(order.orderDate)}</div>
                </div>

                {order.orderNumber && (
                  <div className="detail-item">
                    <div className="detail-label">
                      <Hash size={16} />
                      Order Number
                    </div>
                    <div className="detail-value">{order.orderNumber}</div>
                  </div>
                )}

                {order.supplier && (
                  <div className="detail-item">
                    <div className="detail-label">
                      <User size={16} />
                      Supplier
                    </div>
                    <div className="detail-value">{order.supplier}</div>
                  </div>
                )}

                <div className="detail-item">
                  <div className="detail-label">Status</div>
                  <div className="detail-value">
                    <span className={`status-badge status-${order.status}`}>
                      {order.status}
                    </span>
                  </div>
                </div>

                <div className="detail-item">
                  <div className="detail-label">
                    <DollarSign size={16} />
                    Total Amount
                  </div>
                  <div className="detail-value detail-value-highlight">
                    {formatCurrency(displayTotal)}
                  </div>
                </div>

                {typeof order.tax === 'number' && order.tax > 0 && (
                  <div className="detail-item">
                    <div className="detail-label">
                      <DollarSign size={16} />
                      Tax
                    </div>
                    <div
                      className="detail-value"
                      title="Imported from AliExpress &quot;Additional charges&quot; on the order detail page"
                    >
                      {formatCurrency(order.tax)}
                    </div>
                  </div>
                )}

                <div className="detail-item">
                  <div className="detail-label">
                    <Package size={16} />
                    Items Count
                  </div>
                  <div className="detail-value">{order.items.length} items</div>
                </div>
              </div>

              {order.notes && (
                <div className="detail-item full-width">
                  <div className="detail-label">
                    <FileText size={16} />
                    Notes
                  </div>
                  <div className="detail-value detail-notes">{order.notes}</div>
                </div>
              )}
            </div>

            {/* Order Items */}
            <div className="detail-section">
              <h3 className="detail-section-title">Order Items</h3>
              <div className="order-items-table order-items-table--detail">
                <div className="table-header">
                  <div className="table-cell">Image</div>
                  <div className="table-cell">Component</div>
                  <div className="table-cell">Part Number</div>
                  <div className="table-cell">Quantity</div>
                  <div className="table-cell">Unit Cost</div>
                  <div className="table-cell">Total</div>
                  <div className="table-cell">Notes</div>
                </div>
                {order.items.map(item => {
                  const imageUrl = resolveOrderItemImage(item);
                  const displayName = item.productTitle || item.componentName;
                  return (
                    <div key={item.id} className="table-row">
                      <div className="table-cell">
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
                      </div>
                      <div className="table-cell">
                        <div className="component-info">
                          <span className="component-name">{displayName}</span>
                          {item.variation && (
                            <span className="item-variation">{item.variation}</span>
                          )}
                        </div>
                      </div>
                      <div className="table-cell">
                        {item.componentPartNumber && (
                          <span className="part-number">{item.componentPartNumber}</span>
                        )}
                      </div>
                      <div className="table-cell">
                        <span className="quantity">{item.quantity}</span>
                      </div>
                      <div className="table-cell">
                        <span className="unit-cost">{formatCurrency(item.unitCost)}</span>
                        {typeof item.listUnitCost === 'number' && item.listUnitCost > item.unitCost && (
                          <span className="unit-cost-strikethrough" title="Detail-page list price before store discount + coin credit">
                            {formatCurrency(item.listUnitCost)}
                          </span>
                        )}
                        {item.packSize && item.packSize > 1 && (
                          <span
                            className="unit-cost-per-unit"
                            title={`Pack of ${item.packSize} — per-unit cost = unit price ÷ pack size`}
                          >
                            pack of {item.packSize}, {formatCurrency(item.unitCost / item.packSize)}/unit
                          </span>
                        )}
                      </div>
                      <div className="table-cell">
                        <span className="total-cost">{formatCurrency(item.unitCost * item.quantity)}</span>
                      </div>
                      <div className="table-cell">
                        {item.notes && <span className="item-notes">{item.notes}</span>}
                      </div>
                    </div>
                  );
                })}
                <div className="table-row table-footer">
                  <div className="table-cell"></div>
                  <div className="table-cell"></div>
                  <div className="table-cell"></div>
                  <div className="table-cell"></div>
                  <div className="table-cell table-total-label">Subtotal:</div>
                  <div className="table-cell table-total-value">
                    {formatCurrency(itemsSubtotal)}
                  </div>
                  <div className="table-cell"></div>
                </div>
                {taxAmount > 0 && (
                  <div className="table-row table-footer">
                    <div className="table-cell"></div>
                    <div className="table-cell"></div>
                    <div className="table-cell"></div>
                    <div className="table-cell"></div>
                    <div
                      className="table-cell table-total-label"
                      title="Imported from AliExpress &quot;Additional charges&quot; on the order detail page"
                    >
                      Tax:
                    </div>
                    <div className="table-cell table-total-value">
                      {formatCurrency(taxAmount)}
                    </div>
                    <div className="table-cell"></div>
                  </div>
                )}
                <div className="table-row table-footer">
                  <div className="table-cell"></div>
                  <div className="table-cell"></div>
                  <div className="table-cell"></div>
                  <div className="table-cell"></div>
                  <div className="table-cell table-total-label">Total:</div>
                  <div className="table-cell table-total-value">
                    {formatCurrency(displayTotal)}
                  </div>
                  <div className="table-cell"></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {onDelete && (
            <button 
              className="btn btn-danger"
              onClick={handleDelete}
              style={{ marginRight: 'auto' }}
            >
              <Trash2 size={16} />
              Delete Order
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          {onEdit && (
            <button className="btn btn-primary" onClick={handleEdit}>
              <Edit size={16} />
              Edit Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}