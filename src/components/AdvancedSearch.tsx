import { useState } from 'react';
import { Search, Filter, X, ChevronDown, ChevronUp, SortAsc, SortDesc } from 'lucide-react';
import { SearchFilters } from '../types';
import { TagInput } from './TagInput';

interface AdvancedSearchProps {
  searchTerm: string;
  onSearchTermChange: (term: string) => void;
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  categories: string[];
  subcategories: string[];
  manufacturers: string[];
  allTags: string[];
  loading?: boolean;
}

export function AdvancedSearch({
  searchTerm,
  onSearchTermChange,
  filters,
  onFiltersChange,
  categories,
  subcategories,
  manufacturers,
  allTags,
  loading = false
}: AdvancedSearchProps) {
  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = (key: keyof SearchFilters, value: any) => {
    const newFilters = { ...filters };
    if (value === '' || value === undefined || (Array.isArray(value) && value.length === 0)) {
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
    <div className="advanced-search">
      <div className="search-bar">
        <div className="search-input-container">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search by name, part number, description, tags, location..."
            value={searchTerm}
            onChange={(e) => onSearchTermChange(e.target.value)}
            className="search-input"
          />
          {loading && <div className="search-loading">⏳</div>}
        </div>
        
        <button
          className={`filter-toggle-btn ${showFilters ? 'active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          title="Advanced Filters"
        >
          <Filter size={20} />
          {activeFilterCount > 0 && (
            <span className="filter-badge">{activeFilterCount}</span>
          )}
          {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {showFilters && (
        <div className="advanced-filters">
          <div className="filters-header">
            <h3>Advanced Filters</h3>
            {activeFilterCount > 0 && (
              <button className="clear-filters-btn" onClick={clearFilters}>
                <X size={16} />
                Clear All ({activeFilterCount})
              </button>
            )}
          </div>

          <div className="filters-grid">
            {/* Basic Filters */}
            <div className="filter-group">
              <label className="filter-label">Category</label>
              <select
                value={filters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="filter-select"
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Subcategory</label>
              <select
                value={filters.subcategory || ''}
                onChange={(e) => handleFilterChange('subcategory', e.target.value)}
                className="filter-select"
                disabled={!filters.category}
              >
                <option value="">All Subcategories</option>
                {subcategories.map(subcategory => (
                  <option key={subcategory} value={subcategory}>{subcategory}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Manufacturer</label>
              <select
                value={filters.manufacturer || ''}
                onChange={(e) => handleFilterChange('manufacturer', e.target.value)}
                className="filter-select"
              >
                <option value="">All Manufacturers</option>
                {manufacturers.map(manufacturer => (
                  <option key={manufacturer} value={manufacturer}>{manufacturer}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="filter-select"
              >
                <option value="">All Statuses</option>
                <option value="available">Available</option>
                <option value="on_order">On Order</option>
                <option value="in_use">In Use</option>
                <option value="reserved">Reserved</option>
                <option value="needs_testing">Needs Testing</option>
                <option value="defective">Defective</option>
              </select>
            </div>

            {/* Advanced Text Filters */}
            <div className="filter-group">
              <label className="filter-label">Part Number</label>
              <input
                type="text"
                placeholder="Search part numbers..."
                value={filters.partNumber || ''}
                onChange={(e) => handleFilterChange('partNumber', e.target.value)}
                className="filter-input"
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Location Name</label>
              <input
                type="text"
                placeholder="Search location names..."
                value={filters.locationName || ''}
                onChange={(e) => handleFilterChange('locationName', e.target.value)}
                className="filter-input"
              />
            </div>

            {/* Quantity Filters */}
            <div className="filter-group">
              <label className="filter-label">Min Quantity</label>
              <input
                type="number"
                placeholder="Minimum quantity"
                value={filters.minQuantity || ''}
                onChange={(e) => handleFilterChange('minQuantity', e.target.value ? parseInt(e.target.value) : undefined)}
                className="filter-input"
                min="0"
              />
            </div>

            <div className="filter-group">
              <label className="filter-label">Max Quantity</label>
              <input
                type="number"
                placeholder="Maximum quantity"
                value={filters.maxQuantity || ''}
                onChange={(e) => handleFilterChange('maxQuantity', e.target.value ? parseInt(e.target.value) : undefined)}
                className="filter-input"
                min="0"
              />
            </div>
          </div>

          {/* Tags Filter */}
          <div className="filter-group-full">
            <TagInput
              label="Filter by Tags"
              tags={filters.tags || []}
              onChange={(tags) => handleFilterChange('tags', tags)}
              placeholder="Add tags to filter by..."
              maxTags={5}
            />
            {allTags.length > 0 && (
              <div className="tag-suggestions">
                <span className="tag-suggestions-label">Suggestions:</span>
                {allTags.slice(0, 10).map(tag => (
                  <button
                    key={tag}
                    className="tag-suggestion"
                    onClick={() => {
                      const currentTags = filters.tags || [];
                      if (!currentTags.includes(tag)) {
                        handleFilterChange('tags', [...currentTags, tag]);
                      }
                    }}
                    disabled={filters.tags?.includes(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sorting Options */}
          <div className="sorting-section">
            <h4>Sorting</h4>
            <div className="sorting-controls">
              <div className="filter-group">
                <label className="filter-label">Sort By</label>
                <select
                  value={filters.sortBy || 'name'}
                  onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                  className="filter-select"
                >
                  <option value="name">Name</option>
                  <option value="category">Category</option>
                  <option value="quantity">Quantity</option>
                  <option value="updated_at">Last Updated</option>
                  <option value="created_at">Created Date</option>
                  <option value="location_name">Location</option>
                </select>
              </div>

              <div className="filter-group">
                <label className="filter-label">Order</label>
                <div className="sort-order-toggle">
                  <button
                    className={`sort-btn ${filters.sortOrder !== 'desc' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('sortOrder', 'asc')}
                    title="Ascending"
                  >
                    <SortAsc size={16} />
                    Asc
                  </button>
                  <button
                    className={`sort-btn ${filters.sortOrder === 'desc' ? 'active' : ''}`}
                    onClick={() => handleFilterChange('sortOrder', 'desc')}
                    title="Descending"
                  >
                    <SortDesc size={16} />
                    Desc
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}