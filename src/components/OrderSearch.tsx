import { useState } from 'react';
import { Search, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';

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

interface OrderSearchProps {
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  filters: OrderFilters;
  onFiltersChange: (filters: OrderFilters) => void;
  suppliers: string[];
  loading?: boolean;
}

export function OrderSearch({
  searchTerm,
  onSearchTermChange,
  filters,
  onFiltersChange,
  suppliers,
  loading = false
}: OrderSearchProps) {
  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = (key: keyof OrderFilters, value: any) => {
    const newFilters = { ...filters };
    if (value === '' || value === undefined) {
      delete newFilters[key];
    } else {
      newFilters[key] = value;
    }
    onFiltersChange(newFilters);
  };

  const clearFilters = () => {
    onFiltersChange({});
  };

  const activeFilterCount = Object.keys(filters).length;

  return (
    <div className="order-search">
      <div className="order-search-bar">
        <div className="search-input-container">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search by order number, supplier, notes..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="search-input"
          />
          {loading && <div className="search-loading">⏳</div>}
        </div>
        
        <button
          className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          title="Order Filters"
        >
          <Filter size={20} />
          {activeFilterCount > 0 && (
            <span className="filter-badge">{activeFilterCount}</span>
          )}
          {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="order-filters">
          <div className="filters-header">
            <h4>Order Filters</h4>
            {activeFilterCount > 0 && (
              <button className="clear-filters-btn" onClick={clearFilters}>
                <X size={16} />
                Clear All ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="filter-group">
            <label className="filter-label">Status</label>
            <select
              value={filters.status || ''}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="filter-select"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="ordered">Ordered</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Supplier</label>
            <select
              value={filters.supplier || ''}
              onChange={(e) => handleFilterChange('supplier', e.target.value)}
              className="filter-select"
            >
              <option value="">All Suppliers</option>
              {suppliers.map(supplier => (
                <option key={supplier} value={supplier}>{supplier}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Date From</label>
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Date To</label>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              className="filter-input"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Min Amount ($)</label>
            <input
              type="number"
              step="0.01"
              placeholder="Minimum total"
              value={filters.minAmount || ''}
              onChange={(e) => handleFilterChange('minAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="filter-input"
              min="0"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Max Amount ($)</label>
            <input
              type="number"
              step="0.01"
              placeholder="Maximum total"
              value={filters.maxAmount || ''}
              onChange={(e) => handleFilterChange('maxAmount', e.target.value ? parseFloat(e.target.value) : undefined)}
              className="filter-input"
              min="0"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">Sort By</label>
            <select
              value={filters.sortBy || 'orderDate'}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="filter-select"
            >
              <option value="orderDate">Order Date</option>
              <option value="orderNumber">Order Number</option>
              <option value="supplier">Supplier</option>
              <option value="totalAmount">Total Amount</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Sort Order</label>
            <select
              value={filters.sortOrder || 'desc'}
              onChange={(e) => handleFilterChange('sortOrder', e.target.value as 'asc' | 'desc')}
              className="filter-select"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}