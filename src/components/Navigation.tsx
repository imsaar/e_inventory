import { Link, useLocation } from 'react-router-dom';
import { Package, MapPin, Folder, BarChart3, ShoppingCart } from 'lucide-react';
// import styles from './Navigation.module.css';

export function Navigation() {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: BarChart3 },
    { path: '/components', label: 'Components', icon: Package },
    { path: '/locations', label: 'Locations', icon: MapPin },
    { path: '/orders', label: 'Orders', icon: ShoppingCart },
    { path: '/projects', label: 'Projects', icon: Folder },
  ];

  return (
    <nav className="navigation">
      <div className="nav-container">
        <div className="nav-brand">
          <Package size={24} />
          <span>Electronics Inventory</span>
        </div>
        
        <div className="nav-links">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`nav-link ${location.pathname === path ? 'active' : ''}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}