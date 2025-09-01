import { useEffect, useState } from 'react';
import { Search, Plus, Filter, Grid, List, Package, Trash2, Square } from 'lucide-react';
import { Component, SearchFilters } from '../types';
import { ComponentCard } from '../components/ComponentCard';
import { ComponentForm } from '../components/ComponentForm';
import { BulkDeleteDialog } from '../components/BulkDeleteDialog';

export function Components() {
  const [components, setComponents] = useState<Component[]>([]);
  const [filteredComponents, setFilteredComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);

  const categories = Array.from(new Set(components.map(c => c.category))).sort();
  const manufacturers = Array.from(new Set(components.map(c => c.manufacturer).filter(Boolean))).sort();

  useEffect(() => {
    loadComponents();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [components, searchTerm, filters]);

  const loadComponents = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/components');
      const data = await response.json();
      setComponents(data);
    } catch (error) {
      console.error('Error loading components:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...components];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(component =>
        component.name.toLowerCase().includes(term) ||
        component.partNumber?.toLowerCase().includes(term) ||
        component.description?.toLowerCase().includes(term) ||
        component.manufacturer?.toLowerCase().includes(term)
      );
    }

    if (filters.category) {
      filtered = filtered.filter(c => c.category === filters.category);
    }

    if (filters.status) {
      filtered = filtered.filter(c => c.status === filters.status);
    }

    if (filters.manufacturer) {
      filtered = filtered.filter(c => c.manufacturer === filters.manufacturer);
    }

    if (filters.minQuantity !== undefined) {
      filtered = filtered.filter(c => c.quantity >= filters.minQuantity!);
    }

    setFilteredComponents(filtered);
  };

  const handleComponentSaved = () => {
    loadComponents();
    setShowForm(false);
    setEditingComponent(null);
  };

  const handleComponentDeleted = () => {
    loadComponents();
    setShowForm(false);
    setEditingComponent(null);
  };

  const handleEdit = (component: Component) => {
    setEditingComponent(component);
    setShowForm(true);
  };

  const handleDelete = async (componentId: string) => {
    if (!confirm('Are you sure you want to delete this component?')) return;

    try {
      await fetch(`/api/components/${componentId}`, { method: 'DELETE' });
      loadComponents();
    } catch (error) {
      console.error('Error deleting component:', error);
    }
  };

  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedComponents(new Set());
  };

  const toggleComponentSelection = (componentId: string) => {
    const newSelected = new Set(selectedComponents);
    if (newSelected.has(componentId)) {
      newSelected.delete(componentId);
    } else {
      newSelected.add(componentId);
    }
    setSelectedComponents(newSelected);
  };

  const selectAllComponents = () => {
    const allComponentIds = new Set(filteredComponents.map(c => c.id));
    setSelectedComponents(allComponentIds);
  };

  const clearSelection = () => {
    setSelectedComponents(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedComponents.size > 0) {
      setShowBulkDelete(true);
    }
  };

  const handleBulkDeleteComplete = (results: any) => {
    setShowBulkDelete(false);
    setBulkMode(false);
    setSelectedComponents(new Set());
    loadComponents();
    
    if (results.summary) {
      const { deleted, failed } = results.summary;
      let message = `Bulk delete completed.\n`;
      if (deleted > 0) message += `✓ ${deleted} components deleted successfully\n`;
      if (failed > 0) message += `⚠ ${failed} components could not be deleted due to dependencies`;
      alert(message);
    }
  };

  if (loading) {
    return <div className="loading">Loading components...</div>;
  }

  return (
    <div className="components-page">
      <div className="page-header">
        <h1>Components ({filteredComponents.length})</h1>
        <div className="header-actions">
          {filteredComponents.length > 0 && (
            <button 
              className={`btn btn-secondary ${bulkMode ? 'active' : ''}`}
              onClick={toggleBulkMode}
            >
              <Square size={20} />
              {bulkMode ? 'Exit Bulk Mode' : 'Bulk Select'}
            </button>
          )}
          
          <button
            className={`btn btn-secondary ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            disabled={bulkMode}
          >
            <Grid size={20} />
          </button>
          <button
            className={`btn btn-secondary ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            disabled={bulkMode}
          >
            <List size={20} />
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
            disabled={bulkMode}
          >
            <Plus size={20} />
            Add Component
          </button>
        </div>
      </div>

      {bulkMode && (
        <div className="bulk-controls">
          <div className="bulk-info">
            <span className="selected-count">
              {selectedComponents.size} selected
            </span>
            <div className="bulk-actions">
              <button 
                className="btn btn-small btn-secondary"
                onClick={selectAllComponents}
                disabled={selectedComponents.size === filteredComponents.length}
              >
                Select All Visible
              </button>
              <button 
                className="btn btn-small btn-secondary"
                onClick={clearSelection}
                disabled={selectedComponents.size === 0}
              >
                Clear
              </button>
              <button 
                className="btn btn-small btn-danger"
                onClick={handleBulkDelete}
                disabled={selectedComponents.size === 0}
              >
                <Trash2 size={14} />
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="search-filters">
        <div className="search-row">
          <div className="search-input">
            <div className="input-with-icon">
              <Search size={20} />
              <input
                type="text"
                placeholder="Search components..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input"
              />
            </div>
          </div>
          <button
            className={`btn btn-secondary ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={20} />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="filter-row">
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={filters.category || ''}
                onChange={(e) => setFilters({ ...filters, category: e.target.value || undefined })}
              >
                <option value="">All Categories</option>
                {categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any || undefined })}
              >
                <option value="">All Status</option>
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="reserved">Reserved</option>
                <option value="needs_testing">Needs Testing</option>
                <option value="defective">Defective</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Manufacturer</label>
              <select
                className="form-select"
                value={filters.manufacturer || ''}
                onChange={(e) => setFilters({ ...filters, manufacturer: e.target.value || undefined })}
              >
                <option value="">All Manufacturers</option>
                {manufacturers.map(manufacturer => (
                  <option key={manufacturer} value={manufacturer}>{manufacturer}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Min Quantity</label>
              <input
                type="number"
                className="form-input"
                value={filters.minQuantity || ''}
                onChange={(e) => setFilters({ 
                  ...filters, 
                  minQuantity: e.target.value ? parseInt(e.target.value) : undefined 
                })}
                placeholder="0"
              />
            </div>
          </div>
        )}
      </div>

      <div className={`components-container ${viewMode}`}>
        {filteredComponents.map(component => (
          <ComponentCard
            key={component.id}
            component={component}
            viewMode={viewMode}
            onEdit={() => handleEdit(component)}
            onDelete={() => handleDelete(component.id)}
            bulkMode={bulkMode}
            isSelected={selectedComponents.has(component.id)}
            onToggleSelection={() => toggleComponentSelection(component.id)}
          />
        ))}
      </div>

      {filteredComponents.length === 0 && (
        <div className="empty-state">
          <Package size={48} />
          <h3>No components found</h3>
          <p>Try adjusting your search or filters, or add your first component.</p>
        </div>
      )}

      {showForm && (
        <ComponentForm
          component={editingComponent}
          onSave={handleComponentSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingComponent(null);
          }}
          onDelete={editingComponent ? handleComponentDeleted : undefined}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteDialog
          items={Array.from(selectedComponents)}
          itemType="components"
          onCancel={() => setShowBulkDelete(false)}
          onConfirm={handleBulkDeleteComplete}
        />
      )}
    </div>
  );
}