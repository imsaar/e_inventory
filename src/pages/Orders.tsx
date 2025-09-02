import { useEffect, useState } from 'react';
import { Plus, ShoppingCart, Package, Calendar, DollarSign, Trash2, Upload, CheckSquare, Square, X } from 'lucide-react';
import { Order } from '../types';
import { OrderForm } from '../components/OrderForm';
import { OrderSearch } from '../components/OrderSearch';
import { OrderDetailView } from '../components/OrderDetailView';
import { AliExpressImport } from '../components/AliExpressImport';

interface OrderFilters {
  status?: string;
  supplier?: string;
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [allOrders, setAllOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<OrderFilters>({});
  const [showDetailView, setShowDetailView] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Get unique suppliers for filter options
  const suppliers = Array.from(new Set(allOrders.map(o => o.supplier).filter(Boolean) as string[])).sort();

  useEffect(() => {
    loadAllOrders();
    searchOrders();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchOrders();
    }, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [searchTerm, filters]);

  const loadAllOrders = async () => {
    try {
      const response = await fetch('/api/orders');
      const data = await response.json();
      setAllOrders(data);
    } catch (error) {
      console.error('Error loading all orders:', error);
    }
  };

  const searchOrders = async () => {
    try {
      setSearchLoading(true);
      
      const searchParams = new URLSearchParams();
      
      if (searchTerm) {
        searchParams.append('term', searchTerm);
      }
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== null) {
          searchParams.append(key, value.toString());
        }
      });

      const url = `/api/orders${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      setOrders(data);
      
      if (!loading) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error searching orders:', error);
      // Fallback to showing all orders
      setOrders(allOrders);
    } finally {
      setSearchLoading(false);
      if (loading) {
        setLoading(false);
      }
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!confirm('Are you sure you want to delete this order? This will also reverse the quantity changes.')) {
      return;
    }

    try {
      await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      loadAllOrders();
      searchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Failed to delete order');
    }
  };

  const handleOrderSaved = () => {
    setShowForm(false);
    setEditingOrder(null);
    loadAllOrders();
    searchOrders();
  };

  const handleImportComplete = (results: any) => {
    setShowImport(false);
    loadAllOrders();
    searchOrders();
    
    // Show import results notification
    if (results.imported > 0) {
      alert(`Successfully imported ${results.imported} orders with ${results.componentIds.length} components!`);
    }
  };

  const handleViewDetails = (orderId: string) => {
    setDetailOrderId(orderId);
    setShowDetailView(true);
  };

  const handleDetailEdit = (order: Order) => {
    setShowDetailView(false);
    setDetailOrderId(null);
    setEditingOrder(order);
    setShowForm(true);
  };

  const handleDetailDelete = async (orderId: string) => {
    try {
      await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      setShowDetailView(false);
      setDetailOrderId(null);
      loadAllOrders();
      searchOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Failed to delete order');
    }
  };

  const handleSelectOrder = (orderId: string, selected: boolean) => {
    const newSelected = new Set(selectedOrders);
    if (selected) {
      newSelected.add(orderId);
    } else {
      newSelected.delete(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedOrders(new Set(orders.map(o => o.id)));
    } else {
      setSelectedOrders(new Set());
    }
  };

  const handleBulkDelete = async () => {
    if (selectedOrders.size === 0) return;

    const confirmMessage = `Are you sure you want to delete ${selectedOrders.size} order(s)? This will also reverse the quantity changes for all items in these orders.`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setBulkDeleteLoading(true);
      
      const response = await fetch('/api/orders/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderIds: Array.from(selectedOrders),
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`Successfully deleted ${result.results.deleted} order(s)${result.results.errors.length > 0 ? `. Errors: ${result.results.errors.join(', ')}` : ''}`);
        setSelectedOrders(new Set());
        loadAllOrders();
        searchOrders();
      } else {
        alert(`Bulk delete failed: ${result.error || result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error in bulk delete:', error);
      alert('Failed to delete orders. Please try again.');
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const clearSelection = () => {
    setSelectedOrders(new Set());
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

  if (loading) {
    return <div className="loading">Loading orders...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Orders ({orders.length})</h1>
        <div className="header-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => setShowImport(true)}
          >
            <Upload size={20} />
            Import from AliExpress
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
          >
            <Plus size={20} />
            Add Order
          </button>
        </div>
      </div>

      <OrderSearch
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        filters={filters}
        onFiltersChange={setFilters}
        suppliers={suppliers}
        loading={searchLoading}
      />

      {/* Bulk Actions Bar */}
      {selectedOrders.size > 0 && (
        <div className="bulk-actions-bar">
          <div className="bulk-info">
            <span>{selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected</span>
          </div>
          <div className="bulk-actions">
            <button 
              className="btn btn-secondary btn-small"
              onClick={clearSelection}
            >
              <X size={16} />
              Clear Selection
            </button>
            <button 
              className="btn btn-danger btn-small"
              onClick={handleBulkDelete}
              disabled={bulkDeleteLoading}
            >
              <Trash2 size={16} />
              {bulkDeleteLoading ? 'Deleting...' : `Delete ${selectedOrders.size} Order${selectedOrders.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Select All Header */}
      {orders.length > 0 && (
        <div className="bulk-select-header">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={orders.length > 0 && selectedOrders.size === orders.length}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
            <span className="checkmark"></span>
            <span className="checkbox-label">
              {selectedOrders.size === orders.length ? 'Deselect All' : `Select All (${orders.length})`}
            </span>
          </label>
        </div>
      )}

      <div className="grid-container">
        {orders.length === 0 ? (
          <div className="empty-state">
            <ShoppingCart size={48} />
            <h3>No orders found</h3>
            <p>{searchTerm || Object.keys(filters).length > 0 
              ? "No orders match your search criteria. Try adjusting your filters." 
              : "Start by adding your first component order."}</p>
            {(!searchTerm && Object.keys(filters).length === 0) && (
              <button 
                className="btn btn-primary"
                onClick={() => setShowForm(true)}
              >
                <Plus size={20} />
                Add First Order
              </button>
            )}
          </div>
        ) : (
          <div className="orders-grid">
            {orders.map(order => (
              <div key={order.id} className={`order-card ${selectedOrders.has(order.id) ? 'selected' : ''}`}>
                <div className="order-header">
                  <div className="order-checkbox">
                    <label className="checkbox-container">
                      <input
                        type="checkbox"
                        checked={selectedOrders.has(order.id)}
                        onChange={(e) => handleSelectOrder(order.id, e.target.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="checkmark"></span>
                    </label>
                  </div>
                  <div className="order-info">
                    <h3 className="order-number">
                      {order.orderNumber || `Order ${order.id.slice(-8)}`}
                    </h3>
                    <div className="order-meta">
                      <span className={`status-badge status-${order.status}`}>
                        {order.status}
                      </span>
                      {order.supplier && (
                        <span className="supplier">{order.supplier}</span>
                      )}
                    </div>
                  </div>
                  <div className="order-actions">
                    <button 
                      className="btn-icon btn-danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteOrder(order.id);
                      }}
                      title="Delete order"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="order-body">
                  <div className="order-details">
                    <div className="detail-item">
                      <Calendar size={16} />
                      <span>Date: {formatDate(order.orderDate)}</span>
                    </div>
                    {order.totalAmount && (
                      <div className="detail-item">
                        <DollarSign size={16} />
                        <span>Total: {formatCurrency(order.totalAmount)}</span>
                      </div>
                    )}
                    <div className="detail-item">
                      <Package size={16} />
                      <span>{(order as any).itemCount || 0} items</span>
                    </div>
                  </div>

                  {order.notes && (
                    <div className="order-notes">
                      <p>{order.notes}</p>
                    </div>
                  )}
                </div>

                <div className="order-footer">
                  <button 
                    className="btn btn-secondary btn-small"
                    onClick={() => handleViewDetails(order.id)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <OrderForm
          order={editingOrder}
          onSave={handleOrderSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingOrder(null);
          }}
        />
      )}

      {showDetailView && detailOrderId && (
        <OrderDetailView
          orderId={detailOrderId}
          onClose={() => {
            setShowDetailView(false);
            setDetailOrderId(null);
          }}
          onEdit={handleDetailEdit}
          onDelete={handleDetailDelete}
        />
      )}

      {showImport && (
        <AliExpressImport
          onImportComplete={handleImportComplete}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}