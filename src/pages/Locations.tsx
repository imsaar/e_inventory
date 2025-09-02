import { useEffect, useState } from 'react';
import { Plus, MapPin, Package, QrCode, Trash2, Square, CheckSquare, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StorageLocation, Component } from '../types';
import { LocationForm } from '../components/LocationForm';
import { BulkDeleteDialog } from '../components/BulkDeleteDialog';
import { LocationDetailView } from '../components/LocationDetailView';
import { LinkifiedText } from '../utils/linkify';

interface LocationWithChildren extends StorageLocation {
  children: LocationWithChildren[];
}

export function Locations() {
  const [locations, setLocations] = useState<LocationWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLocation, setEditingLocation] = useState<StorageLocation | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [showComponents, setShowComponents] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<StorageLocation | null>(null);
  const [locationComponents, setLocationComponents] = useState<Component[]>([]);
  const [showDetailView, setShowDetailView] = useState(false);
  const [detailLocationId, setDetailLocationId] = useState<string | null>(null);

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/locations');
      const data = await response.json();
      setLocations(data);
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSaved = () => {
    loadLocations();
    setShowForm(false);
    setEditingLocation(null);
  };

  const handleLocationDeleted = () => {
    loadLocations();
    setShowForm(false);
    setEditingLocation(null);
  };

  const handleEdit = (location: StorageLocation) => {
    setEditingLocation(location);
    setShowForm(true);
  };

  const handleViewDetails = (locationId: string) => {
    setDetailLocationId(locationId);
    setShowDetailView(true);
  };

  const handleDetailEdit = (location: StorageLocation) => {
    setShowDetailView(false);
    setDetailLocationId(null);
    setEditingLocation(location);
    setShowForm(true);
  };

  const handleDetailDelete = async (locationId: string) => {
    if (!confirm('Are you sure you want to delete this location?')) return;

    try {
      await fetch(`/api/locations/${locationId}`, { method: 'DELETE' });
      setShowDetailView(false);
      setDetailLocationId(null);
      loadLocations();
    } catch (error) {
      console.error('Error deleting location:', error);
    }
  };

  const toggleBulkMode = () => {
    setBulkMode(!bulkMode);
    setSelectedLocations(new Set());
  };

  const toggleLocationSelection = (locationId: string) => {
    const newSelected = new Set(selectedLocations);
    if (newSelected.has(locationId)) {
      newSelected.delete(locationId);
    } else {
      newSelected.add(locationId);
    }
    setSelectedLocations(newSelected);
  };

  const selectAllLocations = () => {
    const allLocationIds = new Set<string>();
    const collectIds = (locationList: LocationWithChildren[]) => {
      locationList.forEach(location => {
        allLocationIds.add(location.id);
        if (location.children) {
          collectIds(location.children);
        }
      });
    };
    collectIds(locations);
    setSelectedLocations(allLocationIds);
  };

  const clearSelection = () => {
    setSelectedLocations(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedLocations.size > 0) {
      setShowBulkDelete(true);
    }
  };

  const handleBulkDeleteComplete = (results: any) => {
    setShowBulkDelete(false);
    setBulkMode(false);
    setSelectedLocations(new Set());
    loadLocations();
    
    if (results.summary) {
      const { deleted, failed } = results.summary;
      let message = `Bulk delete completed.\n`;
      if (deleted > 0) message += `✓ ${deleted} locations deleted successfully\n`;
      if (failed > 0) message += `⚠ ${failed} locations could not be deleted due to dependencies`;
      alert(message);
    }
  };

  const handleViewComponents = async (location: StorageLocation) => {
    try {
      setSelectedLocation(location);
      const response = await fetch(`/api/locations/${location.id}/components`);
      if (response.ok) {
        const components = await response.json();
        setLocationComponents(components);
        setShowComponents(true);
      } else {
        throw new Error('Failed to load components');
      }
    } catch (error) {
      console.error('Error loading components:', error);
      alert('Failed to load components for this location.');
    }
  };





  const renderLocationTree = (location: LocationWithChildren, depth = 0) => {
    const isSelected = selectedLocations.has(location.id);
    
    return (
      <div key={location.id} className={`location-item depth-${depth} ${isSelected ? 'selected' : ''}`}>
        <div className="location-content">
          {bulkMode && (
            <div className="selection-checkbox">
              <button
                onClick={() => toggleLocationSelection(location.id)}
                className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
              >
                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            </div>
          )}
          
          <div className="location-info">
            <MapPin size={16} />
            <span className="location-name">{location.name}</span>
            <span className="location-type">{location.type}</span>
            {location.qrCode && (
              <div className="qr-code">
                <QrCode size={14} />
                {location.qrCode}
              </div>
            )}
          </div>
          
          {location.description && (
            <div className="location-description">
              <LinkifiedText>{location.description}</LinkifiedText>
            </div>
          )}
          
          <div className="location-actions">
            {!bulkMode && (
              <>
                <button 
                  className="btn-small"
                  onClick={() => handleViewDetails(location.id)}
                  title="View detailed information"
                >
                  <Eye size={14} />
                  View Details
                </button>
                <button 
                  className="btn-small"
                  onClick={() => handleViewComponents(location)}
                >
                  <Package size={14} />
                  View Components
                </button>
                <button 
                  className="btn-small"
                  onClick={() => handleEdit(location)}
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
        
        {location.children && location.children.length > 0 && (
          <div className="location-children">
            {location.children.map(child => renderLocationTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="loading">Loading locations...</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Storage Locations</h1>
        <div className="header-actions">
          {locations.length > 0 && (
            <>
              <Link 
                to="/locations/qr-printing"
                className="btn btn-secondary"
                title="Configure and print QR codes for locations"
              >
                <QrCode size={20} />
                Print QR Codes
              </Link>
              
              <button 
                className={`btn btn-secondary ${bulkMode ? 'active' : ''}`}
                onClick={toggleBulkMode}
              >
                <Square size={20} />
                {bulkMode ? 'Exit Bulk Mode' : 'Bulk Select'}
              </button>
            </>
          )}
          
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
            disabled={bulkMode}
          >
            <Plus size={20} />
            Add Location
          </button>
        </div>
      </div>

      {bulkMode && (
        <div className="bulk-controls">
          <div className="bulk-info">
            <span className="selected-count">
              {selectedLocations.size} selected
            </span>
            <div className="bulk-actions">
              <button 
                className="btn btn-small btn-secondary"
                onClick={selectAllLocations}
                disabled={selectedLocations.size === locations.length}
              >
                Select All
              </button>
              <button 
                className="btn btn-small btn-secondary"
                onClick={clearSelection}
                disabled={selectedLocations.size === 0}
              >
                Clear
              </button>
              <button 
                className="btn btn-small btn-danger"
                onClick={handleBulkDelete}
                disabled={selectedLocations.size === 0}
              >
                <Trash2 size={14} />
                Delete Selected
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="locations-tree">
        {locations.map(location => renderLocationTree(location))}
      </div>

      {locations.length === 0 && (
        <div className="empty-state">
          <MapPin size={48} />
          <h3>No storage locations</h3>
          <p>Create your first storage location to organize your components.</p>
          <button 
            className="btn btn-primary"
            onClick={() => setShowForm(true)}
          >
            Add First Location
          </button>
        </div>
      )}

      {showForm && (
        <LocationForm
          location={editingLocation}
          onSave={handleLocationSaved}
          onCancel={() => {
            setShowForm(false);
            setEditingLocation(null);
          }}
          onDelete={editingLocation ? handleLocationDeleted : undefined}
        />
      )}

      {showBulkDelete && (
        <BulkDeleteDialog
          items={Array.from(selectedLocations)}
          itemType="locations"
          onCancel={() => setShowBulkDelete(false)}
          onConfirm={handleBulkDeleteComplete}
        />
      )}

      {showComponents && selectedLocation && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>
                <Package size={20} />
                Components in {selectedLocation.name}
              </h2>
              <button 
                onClick={() => setShowComponents(false)} 
                className="btn-icon"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {locationComponents.length === 0 ? (
                <div className="empty-state">
                  <Package size={48} />
                  <h3>No components found</h3>
                  <p>This location doesn't contain any components yet.</p>
                </div>
              ) : (
                <div className="components-list">
                  {locationComponents.map(component => (
                    <div key={component.id} className="component-row">
                      <div className="component-info">
                        <div className="component-name">{component.name}</div>
                        {component.partNumber && (
                          <div className="component-part">{component.partNumber}</div>
                        )}
                        <div className="component-details">
                          <span className="component-category">{component.category}</span>
                          <span className="component-quantity">Qty: {component.quantity}</span>
                          <span className={`component-status status-${component.status}`}>
                            {component.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowComponents(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}


      {showDetailView && detailLocationId && (
        <LocationDetailView
          locationId={detailLocationId}
          onClose={() => {
            setShowDetailView(false);
            setDetailLocationId(null);
          }}
          onEdit={handleDetailEdit}
          onDelete={handleDetailDelete}
        />
      )}
    </div>
  );
}