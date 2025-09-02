import { useEffect, useState } from 'react';
import { Package, MapPin, Folder, AlertTriangle, TrendingUp, Database, Download, Upload, ShoppingCart, Calendar, DollarSign } from 'lucide-react';
import { Component, Order } from '../types';

interface DashboardStats {
  totalComponents: number;
  totalLocations: number;
  totalProjects: number;
  totalOrders: number;
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

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [componentsRes, locationsRes, projectsRes, ordersRes, lowStockRes, dbInfoRes] = await Promise.all([
        fetch('/api/components'),
        fetch('/api/locations'),
        fetch('/api/projects'),
        fetch('/api/orders'),
        fetch('/api/components/alerts/low-stock'),
        fetch('/api/database/info')
      ]);

      const components = await componentsRes.json();
      const locations = await locationsRes.json();
      const projects = await projectsRes.json();
      const orders = await ordersRes.json();
      const lowStock = await lowStockRes.json();
      const dbInfo = await dbInfoRes.json();

      const totalValue = components.reduce((sum: number, comp: Component) => 
        sum + (comp.totalCost || 0), 0
      );

      const totalOrderValue = orders.reduce((sum: number, order: any) => 
        sum + (order.totalAmount || order.calculatedTotal || 0), 0
      );

      setStats({
        totalComponents: components.length,
        totalLocations: Array.isArray(locations) ? locations.length : 0,
        totalProjects: projects.length,
        totalOrders: orders.length,
        lowStockCount: lowStock.length,
        totalValue,
        totalOrderValue
      });

      setLowStockComponents(lowStock.slice(0, 5));
      setRecentOrders(orders.slice(0, 5)); // Show 5 most recent orders
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
        lowStockCount: 0,
        totalValue: 0,
        totalOrderValue: 0
      });
      setLoading(false);
    }
  };

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
                        <span className="order-date">
                          <Calendar size={14} />
                          {formatDate(order.orderDate)}
                        </span>
                      </div>
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getOrderStatusColor(order.status) }}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="order-summary-details">
                      {order.supplier && (
                        <span className="order-supplier">{order.supplier}</span>
                      )}
                      <span className="order-total">
                        <DollarSign size={14} />
                        {formatCurrency((order as any).totalAmount || (order as any).calculatedTotal || 0)}
                      </span>
                      <span className="order-items">
                        <Package size={14} />
                        {(order as any).itemCount || 0} items
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}