import { useEffect, useState, useCallback } from 'react';
import { Package, MapPin, Folder, AlertTriangle, TrendingUp, Database, Download, Upload, ShoppingCart, Calendar, DollarSign, Clock } from 'lucide-react';
import { Component, Order } from '../types';
import { useDashboardRefreshListener } from '../hooks/useDashboardRefresh';

interface DashboardStats {
  totalComponents: number;
  totalLocations: number;
  totalProjects: number;
  totalOrders: number;
  pendingOrders: number;
  lowStockCount: number;
  totalValue: number;
  totalOrderValue: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalComponents: 0,
    totalLocations: 0,
    totalProjects: 0,
    totalOrders: 0,
    pendingOrders: 0,
    lowStockCount: 0,
    totalValue: 0,
    totalOrderValue: 0
  });
  const [lowStockComponents, setLowStockComponents] = useState<Component[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbInfo, setDbInfo] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importingFull, setImportingFull] = useState(false);
  const [exportingFull, setExportingFull] = useState(false);

  const loadDashboardData = useCallback(async () => {
    try {
      // Fetch all data concurrently, but handle database info separately to ensure it loads even if others fail
      const [componentsRes, locationsRes, projectsRes, ordersRes, lowStockRes, dbInfoRes] = await Promise.all([
        fetch('/api/components').catch(e => ({ ok: false, json: async () => [] })),
        fetch('/api/locations').catch(e => ({ ok: false, json: async () => [] })),
        fetch('/api/projects').catch(e => ({ ok: false, json: async () => [] })),
        fetch('/api/orders').catch(e => ({ ok: false, json: async () => [] })),
        fetch('/api/components/alerts/low-stock').catch(e => ({ ok: false, json: async () => [] })),
        fetch('/api/database/info').catch(e => ({ ok: false, json: async () => null }))
      ]);

      const components = await componentsRes.json();
      const locations = await locationsRes.json();
      const projects = await projectsRes.json();
      const orders = await ordersRes.json();
      const lowStock = await lowStockRes.json();
      const dbInfo = await dbInfoRes.json();

      const totalValue = Array.isArray(components) ? components.reduce((sum: number, comp: Component) => 
        sum + (comp.totalCost || 0), 0
      ) : 0;

      const totalOrderValue = Array.isArray(orders) ? orders.reduce((sum: number, order: any) => 
        sum + (order.totalAmount || order.calculatedTotal || 0), 0
      ) : 0;

      // Count orders that are not delivered (pending delivery)
      const pendingOrders = Array.isArray(orders) ? orders.filter((order: any) => 
        order.status !== 'delivered'
      ).length : 0;

      setStats({
        totalComponents: Array.isArray(components) ? components.length : 0,
        totalLocations: Array.isArray(locations) ? locations.length : 0,
        totalProjects: Array.isArray(projects) ? projects.length : 0,
        totalOrders: Array.isArray(orders) ? orders.length : 0,
        pendingOrders,
        lowStockCount: Array.isArray(lowStock) ? lowStock.length : 0,
        totalValue,
        totalOrderValue
      });

      setLowStockComponents(Array.isArray(lowStock) ? lowStock.slice(0, 5) : []);
      setRecentOrders(Array.isArray(orders) ? orders.slice(0, 5) : []); // Show 5 most recent orders
      setDbInfo(dbInfo);
      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Set default stats even if there's an error
      setStats({
        totalComponents: 0,
        totalLocations: 0,
        totalProjects: 0,
        totalOrders: 0,
        pendingOrders: 0,
        lowStockCount: 0,
        totalValue: 0,
        totalOrderValue: 0
      });
      // Try to load database info separately
      try {
        const dbInfoRes = await fetch('/api/database/info');
        const dbInfo = await dbInfoRes.json();
        setDbInfo(dbInfo);
      } catch (dbError) {
        console.error('Failed to load database info:', dbError);
        setDbInfo(null);
      }
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Listen for refresh events from other pages
  useDashboardRefreshListener(loadDashboardData);

  const handleExportDatabase = async () => {
    try {
      setExporting(true);
      const response = await fetch('/api/database/export');
      
      if (!response.ok) {
        throw new Error('Failed to export database');
      }
      
      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'database-backup.db';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      alert('Database exported successfully!');
    } catch (error) {
      console.error('Error exporting database:', error);
      alert('Failed to export database. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportDatabase = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.db')) {
      alert('Please select a valid database file (.db)');
      return;
    }
    
    if (!confirm('Importing a database will replace all current data. This action cannot be undone. Continue?')) {
      return;
    }
    
    try {
      setImporting(true);
      
      const formData = new FormData();
      formData.append('database', file);
      
      const response = await fetch('/api/database/import', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import database');
      }
      
      alert('Database imported successfully! The application will restart.');
      // The server will restart automatically after import
      
    } catch (error) {
      console.error('Error importing database:', error);
      alert('Failed to import database. Please check the file and try again.');
    } finally {
      setImporting(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleExportAllData = async () => {
    try {
      setExportingFull(true);
      const response = await fetch('/api/database/export-all');
      
      if (!response.ok) {
        throw new Error('Failed to export full backup');
      }
      
      // Create download link
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'inventory-full-backup.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log('Full backup exported successfully!');
    } catch (error) {
      console.error('Error exporting full backup:', error);
      alert('Failed to export full backup. Please try again.');
    } finally {
      setExportingFull(false);
    }
  };

  const handleImportAllData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!file.name.endsWith('.zip')) {
      alert('Please select a valid backup file (.zip)');
      return;
    }
    
    if (!confirm('Importing a full backup will replace all current data including images and files. This action cannot be undone. Continue?')) {
      return;
    }
    
    try {
      setImportingFull(true);
      
      const formData = new FormData();
      formData.append('backup', file);
      
      const response = await fetch('/api/database/import-all', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import full backup');
      }
      
      alert('Full backup imported successfully! The application will restart to load all data.');
      // The server will restart automatically after import
      
    } catch (error) {
      console.error('Error importing full backup:', error);
      alert('Failed to import full backup. Please check the file and try again.');
    } finally {
      setImportingFull(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleFactoryReset = async () => {
    const confirmMessage = `⚠️ FACTORY RESET WARNING ⚠️

This will PERMANENTLY DELETE all data including:
• All components, orders, projects, and locations
• All uploaded images and files  
• All user data and settings

This action CANNOT be undone unless you have a backup to restore from.

Type "FACTORY RESET" below to confirm:`;
    
    const userInput = prompt(confirmMessage);
    
    if (userInput !== 'FACTORY RESET') {
      if (userInput !== null) {
        alert('Factory reset cancelled. You must type exactly "FACTORY RESET" to proceed.');
      }
      return;
    }

    try {
      const response = await fetch('/api/database/factory-reset', {
        method: 'DELETE'
      });

      const result = await response.json();

      if (response.ok) {
        alert(`✅ ${result.message}\n\nThe page will reload to reflect the changes.`);
        // Reload the page to reflect the empty state
        window.location.reload();
      } else {
        throw new Error(result.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error performing factory reset:', error);
      alert(`❌ Factory reset failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again or contact support.`);
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

  const getOrderStatusColor = (status: Order['status']) => {
    switch (status) {
      case 'pending': return '#ff9800';
      case 'ordered': return '#2196f3';
      case 'shipped': return '#9c27b0';
      case 'delivered': return '#4caf50';
      case 'cancelled': return '#f44336';
      default: return '#666';
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-layout">
        <div className="dashboard-main">
          <h1>Electronics Inventory Dashboard</h1>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <Package size={32} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.totalComponents}</div>
                <div className="stat-label">Total Components</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <MapPin size={32} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.totalLocations}</div>
                <div className="stat-label">Storage Locations</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Folder size={32} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.totalProjects}</div>
                <div className="stat-label">Active Projects</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <ShoppingCart size={32} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.totalOrders}</div>
                <div className="stat-label">Total Orders</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <Clock size={32} />
              </div>
              <div className="stat-content">
                <div className="stat-value">{stats.pendingOrders}</div>
                <div className="stat-label">Pending Orders</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">
                <TrendingUp size={32} />
              </div>
              <div className="stat-content">
                <div className="stat-value">${stats.totalOrderValue.toFixed(2)}</div>
                <div className="stat-label">Total Order Value</div>
              </div>
            </div>
          </div>

          {stats.lowStockCount > 0 && (
            <div className="alert-section">
              <h2 className="section-title">
                <AlertTriangle size={24} />
                Low Stock Alerts ({stats.lowStockCount})
              </h2>
              
              <div className="alert-grid">
                {lowStockComponents.map(component => (
                  <div key={component.id} className="alert-card">
                    <div className="alert-header">
                      <span className="component-name">{component.name}</span>
                      <span className="quantity-alert">
                        {component.quantity}/{component.minThreshold}
                      </span>
                    </div>
                    <div className="alert-details">
                      <span className="component-category">{component.category}</span>
                      {component.partNumber && (
                        <span className="component-part-number">{component.partNumber}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {stats.lowStockCount > 5 && (
                <div className="view-all">
                  <a href="/components?filter=low-stock" className="btn btn-primary">
                    View All Low Stock Items
                  </a>
                </div>
              )}
            </div>
          )}

          {recentOrders.length > 0 && (
            <div className="recent-orders-section">
              <h2 className="section-title">
                <ShoppingCart size={24} />
                Recent Orders ({stats.totalOrders})
              </h2>
              
              <div className="orders-list">
                {recentOrders.map(order => (
                  <div key={order.id} className="order-summary-card">
                    <div className="order-summary-header">
                      <div className="order-info">
                        <span className="order-number">
                          {order.orderNumber || `#${order.id.slice(-8)}`}
                        </span>
                      </div>
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getOrderStatusColor(order.status) }}
                      >
                        {order.status}
                      </span>
                    </div>
                    {/* Items section - moved above supplier/price */}
                    <div className="order-items-section">
                      {(order as any).itemsSummary && (order as any).itemsSummary.length > 0 ? (
                        <div className="items-summary">
                          {(order as any).itemsSummary.map((item: any, index: number) => (
                            <div key={index} className="dashboard-item-summary">
                              {item.image && (
                                <img 
                                  src={`/uploads/${item.image}`} 
                                  alt={item.name}
                                  className="dashboard-item-thumbnail"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              )}
                              <span className="dashboard-item-text">
                                {item.quantity}× {item.name}
                              </span>
                            </div>
                          ))}
                          {(order as any).itemCount > (order as any).itemsSummary.length && (
                            <span className="items-more">
                              +{(order as any).itemCount - (order as any).itemsSummary.length} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="order-items">
                          <Package size={14} />
                          <span>{(order as any).itemCount || 0} items</span>
                        </div>
                      )}
                    </div>

                    {/* Date, supplier, and price on same line */}
                    <div className="order-summary-details">
                      <span className="order-date">
                        <Calendar size={14} />
                        {formatDate(order.orderDate)}
                      </span>
                      {order.supplier && (
                        <span className="order-supplier">{order.supplier}</span>
                      )}
                      <span className="order-total dashboard-order-total">
                        {formatCurrency((order as any).totalAmount || (order as any).calculatedTotal || 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              
              {stats.totalOrders > 5 && (
                <div className="view-all">
                  <a href="/orders" className="btn btn-primary">
                    View All Orders
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="dashboard-sidebar">
          <div className="sidebar-section">
            <h3 className="sidebar-title">
              <Database size={20} />
              Database Management
            </h3>
            
            <div className="sidebar-info">
              {dbInfo ? (
                <>
                  <div className="info-item">
                    <span className="info-label">Size</span>
                    <span className="info-value">{dbInfo.sizeFormatted || 'Unknown'}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Schema Version</span>
                    <span className="info-value">{dbInfo.schemaVersion || 1}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Last Modified</span>
                    <span className="info-value">
                      {dbInfo.lastModified ? new Date(dbInfo.lastModified).toLocaleDateString() : 'Unknown'}
                    </span>
                  </div>
                  {dbInfo.tables && (
                    <>
                      <div className="info-item">
                        <span className="info-label">Components</span>
                        <span className="info-value">{dbInfo.tables.components || 0}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Locations</span>
                        <span className="info-value">{dbInfo.tables.locations || 0}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Projects</span>
                        <span className="info-value">{dbInfo.tables.projects || 0}</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="info-loading">Loading database information...</div>
              )}
            </div>
            
            <div className="sidebar-actions">
              <button 
                className="btn btn-secondary btn-full-width"
                onClick={handleExportDatabase}
                disabled={exporting}
              >
                <Download size={16} />
                {exporting ? 'Exporting...' : 'Export'}
              </button>
              
              <label 
                htmlFor="database-import" 
                className="btn btn-primary btn-full-width" 
                style={{cursor: importing ? 'not-allowed' : 'pointer'}}
              >
                <Upload size={16} />
                {importing ? 'Importing...' : 'Import'}
              </label>
              <input
                id="database-import"
                type="file"
                accept=".db"
                onChange={handleImportDatabase}
                style={{ display: 'none' }}
                disabled={importing}
              />
              <div className="sidebar-note">
                Select a .db file to replace current database
              </div>
              
              <hr style={{ margin: 'var(--spacing-md) 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
              
              <div className="sidebar-section-title">Full Backup (Database + Images)</div>
              
              <button 
                className="btn btn-secondary btn-full-width"
                onClick={handleExportAllData}
                disabled={exportingFull}
                title="Export complete backup including database and all uploaded files"
              >
                <Download size={16} />
                {exportingFull ? 'Creating Backup...' : 'Export All Data'}
              </button>
              
              <label 
                htmlFor="full-backup-import" 
                className="btn btn-primary btn-full-width" 
                style={{cursor: importingFull ? 'not-allowed' : 'pointer'}}
                title="Import complete backup including database and all uploaded files"
              >
                <Upload size={16} />
                {importingFull ? 'Restoring...' : 'Import All Data'}
              </label>
              <input
                id="full-backup-import"
                type="file"
                accept=".zip"
                onChange={handleImportAllData}
                style={{ display: 'none' }}
                disabled={importingFull}
              />
              <div className="sidebar-note">
                Select a .zip file to restore complete backup (includes images)
              </div>
              
              <hr style={{ margin: 'var(--spacing-md) 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />
              
              <div className="sidebar-section-title">⚠️ Danger Zone</div>
              
              <button 
                className="btn btn-danger btn-full-width"
                onClick={handleFactoryReset}
                title="Factory reset - permanently delete all data (UNRECOVERABLE without backup)"
              >
                <span style={{ fontSize: '16px' }}>🏭</span>
                Factory Reset
              </button>
              <div className="sidebar-note" style={{ color: '#d32f2f', fontWeight: 'bold' }}>
                ⚠️ This will permanently delete ALL data including components, orders, projects, and uploaded files. This action cannot be undone!
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}