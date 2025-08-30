import { useEffect, useState } from 'react';
import { Package, MapPin, Folder, AlertTriangle, TrendingUp } from 'lucide-react';
import { Component } from '../types';

interface DashboardStats {
  totalComponents: number;
  totalLocations: number;
  totalProjects: number;
  lowStockCount: number;
  totalValue: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalComponents: 0,
    totalLocations: 0,
    totalProjects: 0,
    lowStockCount: 0,
    totalValue: 0
  });
  const [lowStockComponents, setLowStockComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [componentsRes, locationsRes, projectsRes, lowStockRes] = await Promise.all([
        fetch('/api/components'),
        fetch('/api/locations'),
        fetch('/api/projects'),
        fetch('/api/components/alerts/low-stock')
      ]);

      const components = await componentsRes.json();
      const locations = await locationsRes.json();
      const projects = await projectsRes.json();
      const lowStock = await lowStockRes.json();

      const totalValue = components.reduce((sum: number, comp: Component) => 
        sum + (comp.totalCost || 0), 0
      );

      setStats({
        totalComponents: components.length,
        totalLocations: Array.isArray(locations) ? locations.length : 0,
        totalProjects: projects.length,
        lowStockCount: lowStock.length,
        totalValue
      });

      setLowStockComponents(lowStock.slice(0, 5));
      setLoading(false);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading dashboard...</div>;
  }

  return (
    <div className="dashboard">
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
            <TrendingUp size={32} />
          </div>
          <div className="stat-content">
            <div className="stat-value">${stats.totalValue.toFixed(2)}</div>
            <div className="stat-label">Total Inventory Value</div>
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
    </div>
  );
}