import { useEffect, useState } from 'react';
import { Plus, Grid, List, Package, Trash2, Square, QrCode } from 'lucide-react';
import { Component, SearchFilters } from '../types';
import { ComponentCard } from '../components/ComponentCard';
import { ComponentForm } from '../components/ComponentForm';
import { BulkDeleteDialog } from '../components/BulkDeleteDialog';
import { AdvancedSearch } from '../components/AdvancedSearch';
import { ComponentDetailView } from '../components/ComponentDetailView';

export function Components() {
  const [components, setComponents] = useState<Component[]>([]);
  const [allComponents, setAllComponents] = useState<Component[]>([]); // For filter options
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({});
  
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showDetailView, setShowDetailView] = useState(false);
  const [detailComponentId, setDetailComponentId] = useState<string | null>(null);

  const categories = Array.from(new Set(allComponents.map(c => c.category))).sort();
  const subcategories = Array.from(new Set(allComponents.map(c => c.subcategory).filter(Boolean) as string[])).sort();
  const manufacturers = Array.from(new Set(allComponents.map(c => c.manufacturer).filter(Boolean) as string[])).sort();
  const allTags = Array.from(new Set(allComponents.flatMap(c => c.tags || []))).sort();

  useEffect(() => {
    loadAllComponents();
    searchComponents();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchComponents();
    }, 300); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [searchTerm, filters]);

  const loadAllComponents = async () => {
    try {
      const response = await fetch('/api/components');
      const data = await response.json();
      setAllComponents(data);
    } catch (error) {
      console.error('Error loading all components:', error);
    }
  };

  const searchComponents = async () => {
    try {
      setSearchLoading(true);
      
      const searchParams = new URLSearchParams();
      
      if (searchTerm) {
        searchParams.append('term', searchTerm);
      }
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== '' && value !== null) {
          if (Array.isArray(value)) {
            if (value.length > 0) {
              searchParams.append(key, value.join(','));
            }
          } else {
            searchParams.append(key, value.toString());
          }
        }
      });

      const url = `/api/components${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
      const response = await fetch(url);
      const data = await response.json();
      setComponents(data);
      
      if (!loading) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error searching components:', error);
    } finally {
      setSearchLoading(false);
      if (loading) {
        setLoading(false);
      }
    }
  };

  const handleComponentSaved = () => {
    searchComponents();
    loadAllComponents();
    setShowForm(false);
    setEditingComponent(null);
  };

  const handleComponentDeleted = () => {
    searchComponents();
    loadAllComponents();
    setShowForm(false);
    setEditingComponent(null);
  };

  const handleEdit = (component: Component) => {
    setEditingComponent(component);
    setShowForm(true);
  };

  const handleViewDetails = (componentId: string) => {
    setDetailComponentId(componentId);
    setShowDetailView(true);
  };

  const handleDetailEdit = (component: Component) => {
    setShowDetailView(false);
    setDetailComponentId(null);
    setEditingComponent(component);
    setShowForm(true);
  };

  const handleDetailDelete = async (componentId: string) => {
    if (!confirm('Are you sure you want to delete this component?')) return;

    try {
      await fetch(`/api/components/${componentId}`, { method: 'DELETE' });
      setShowDetailView(false);
      setDetailComponentId(null);
      searchComponents();
      loadAllComponents();
    } catch (error) {
      console.error('Error deleting component:', error);
    }
  };

  const handleDelete = async (componentId: string) => {
    if (!confirm('Are you sure you want to delete this component?')) return;

    try {
      await fetch(`/api/components/${componentId}`, { method: 'DELETE' });
      searchComponents();
      loadAllComponents();
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
    const allComponentIds = new Set(components.map(c => c.id));
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
    searchComponents();
    loadAllComponents();
    
    if (results.summary) {
      const { deleted, failed } = results.summary;
      let message = `Bulk delete completed.\n`;
      if (deleted > 0) message += `✓ ${deleted} components deleted successfully\n`;
      if (failed > 0) message += `⚠ ${failed} components could not be deleted due to dependencies`;
      alert(message);
    }
  };

  const handleGenerateQRCodes = async () => {
    if (selectedComponents.size === 0) {
      alert('Please select at least one component to generate QR codes for.');
      return;
    }

    try {
      // Get all selected component IDs
      const selectedComponentIds = Array.from(selectedComponents);
      
      // Generate QR codes for selected components using small size (default)
      const url = `/api/components/qr-codes/pdf?size=small&componentIds=${selectedComponentIds.join(',')}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate QR codes');
      }
      
      // Open the HTML page in a new window for printing
      const htmlContent = await response.text();
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(htmlContent);
        newWindow.document.close();
        newWindow.focus();
      }
      
      console.log(`QR codes generated for ${selectedComponentIds.length} components`);
    } catch (error) {
      console.error('Error generating QR codes:', error);
      alert('Failed to generate QR codes. Please try again.');
    }
  };

  if (loading) {
    return <div className="loading">Loading components...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Components ({components.length})</h1>
        <div className="header-actions">
          {components.length > 0 && (
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
          {components.length > 0 && (
            <button 
              className="btn btn-secondary"
              onClick={() => window.open('/component-qr-printing', '_blank')}
              disabled={bulkMode}
            >
              <QrCode size={20} />
              Print QR Codes
            </button>
          )}
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
                disabled={selectedComponents.size === components.length}
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
                className="btn btn-small btn-primary"
                onClick={handleGenerateQRCodes}
                disabled={selectedComponents.size === 0}
              >
                <QrCode size={14} />
                Generate QR Codes
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

      <AdvancedSearch
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        filters={filters}
        onFiltersChange={setFilters}
        categories={categories}
        subcategories={subcategories}
        manufacturers={manufacturers}
        allTags={allTags}
        loading={searchLoading}
      />

      <div className={`components-container ${viewMode}`}>
        {components.map(component => (
          <ComponentCard
            key={component.id}
            component={component}
            viewMode={viewMode}
            onEdit={() => handleEdit(component)}
            onDelete={() => handleDelete(component.id)}
            onViewDetails={() => handleViewDetails(component.id)}
            bulkMode={bulkMode}
            isSelected={selectedComponents.has(component.id)}
            onToggleSelection={() => toggleComponentSelection(component.id)}
          />
        ))}
      </div>

      {components.length === 0 && (
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

      {showDetailView && detailComponentId && (
        <ComponentDetailView
          componentId={detailComponentId}
          onClose={() => {
            setShowDetailView(false);
            setDetailComponentId(null);
          }}
          onEdit={handleDetailEdit}
          onDelete={handleDetailDelete}
        />
      )}
    </div>
  );
}