import { useEffect, useState } from 'react';
import { Plus, MapPin, Package, QrCode, Trash2, Square, CheckSquare, FileText } from 'lucide-react';
import { StorageLocation, Component } from '../types';
import { LocationForm } from '../components/LocationForm';
import { BulkDeleteDialog } from '../components/BulkDeleteDialog';

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
  const [qrCodeSize, setQrCodeSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [selectedQRLocations, setSelectedQRLocations] = useState<Set<string>>(new Set());

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

  const handleShowQRDialog = () => {
    // Get locations with QR codes
    const locationsWithQR = getAllLocationsFlat().filter(loc => loc.qrCode);
    if (locationsWithQR.length === 0) {
      alert('No locations with QR codes found. Create locations with QR codes first.');
      return;
    }
    setSelectedQRLocations(new Set(locationsWithQR.map(loc => loc.id)));
    setShowQRDialog(true);
  };

  const handleDownloadQRCodesPDF = async (selectedLocationIds?: string[]) => {
    try {
      let url = `/api/locations/qr-codes/pdf?size=${qrCodeSize}`;
      
      if (selectedLocationIds && selectedLocationIds.length > 0) {
        url += `&locationIds=${selectedLocationIds.join(',')}`;
      }
      
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
        
        // Focus on the new window and suggest printing
        newWindow.focus();
        setTimeout(() => {
          if (confirm('QR codes page opened in new window. Would you like to print it now?')) {
            newWindow.print();
          }
        }, 1000);
      } else {
        throw new Error('Could not open new window. Please check your popup blocker settings.');
      }
      
    } catch (error) {
      console.error('Error generating QR codes:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Error generating QR codes:\n\n${message}`);
    }
  };

  const getAllLocationsFlat = (): StorageLocation[] => {
    const flatLocations: StorageLocation[] = [];
    const collectLocations = (locs: LocationWithChildren[]) => {
      locs.forEach(loc => {
        flatLocations.push(loc);
        if (loc.children) {
          collectLocations(loc.children);
        }
      });
    };
    collectLocations(locations);
    return flatLocations;
  };

  const toggleQRLocationSelection = (locationId: string) => {
    const newSelected = new Set(selectedQRLocations);
    if (newSelected.has(locationId)) {
      newSelected.delete(locationId);
    } else {
      newSelected.add(locationId);
    }
    setSelectedQRLocations(newSelected);
  };

  const selectAllQRLocations = () => {
    const locationsWithQR = getAllLocationsFlat().filter(loc => loc.qrCode);
    setSelectedQRLocations(new Set(locationsWithQR.map(loc => loc.id)));
  };

  const clearQRSelection = () => {
    setSelectedQRLocations(new Set());
  };

  const handleQRDialogGenerate = () => {
    if (selectedQRLocations.size === 0) {
      alert('Please select at least one location to generate QR codes for.');
      return;
    }
    handleDownloadQRCodesPDF(Array.from(selectedQRLocations));
    setShowQRDialog(false);
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
          
          <div className="location-actions">
            {!bulkMode && (
              <>
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
    <div className="locations-page">
      <div className="page-header">
        <h1>Storage Locations</h1>
        <div className="header-actions">
          {locations.length > 0 && (
            <>
              <div className="qr-size-controls">
                <label htmlFor="qr-size-select" className="qr-size-label">
                  QR Size:
                </label>
                <select 
                  id="qr-size-select"
                  value={qrCodeSize} 
                  onChange={(e) => setQrCodeSize(e.target.value as 'small' | 'medium' | 'large')}
                  className="qr-size-select"
                  disabled={bulkMode}
                >
                  <option value="small">Small (6 per row)</option>
                  <option value="medium">Medium (4 per row)</option>
                  <option value="large">Large (3 per row)</option>
                </select>
              </div>
              
              <button 
                className="btn btn-secondary"
                onClick={handleShowQRDialog}
                disabled={bulkMode}
                title="Select locations and generate printable QR codes"
              >
                <FileText size={20} />
                Print QR Codes
              </button>
              
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

      {showQRDialog && (
        <div className="modal-overlay">
          <div className="modal-content qr-selection-modal">
            <div className="modal-header">
              <h2>
                <QrCode size={20} />
                Generate QR Codes for Locations
              </h2>
              <button 
                onClick={() => setShowQRDialog(false)} 
                className="btn-icon"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="qr-options">
                <div className="qr-size-setting">
                  <label htmlFor="qr-modal-size-select" className="qr-size-label">
                    QR Code Size:
                  </label>
                  <select 
                    id="qr-modal-size-select"
                    value={qrCodeSize} 
                    onChange={(e) => setQrCodeSize(e.target.value as 'small' | 'medium' | 'large')}
                    className="qr-size-select"
                  >
                    <option value="small">Small (6 per row)</option>
                    <option value="medium">Medium (4 per row)</option>
                    <option value="large">Large (3 per row)</option>
                  </select>
                </div>

                <div className="qr-selection-controls">
                  <span className="selected-count">
                    {selectedQRLocations.size} locations selected
                  </span>
                  <div className="qr-selection-actions">
                    <button 
                      className="btn btn-small btn-secondary"
                      onClick={selectAllQRLocations}
                    >
                      Select All
                    </button>
                    <button 
                      className="btn btn-small btn-secondary"
                      onClick={clearQRSelection}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="qr-locations-list">
                {getAllLocationsFlat()
                  .filter(location => location.qrCode)
                  .map(location => {
                    const isSelected = selectedQRLocations.has(location.id);
                    return (
                      <div key={location.id} className={`qr-location-item ${isSelected ? 'selected' : ''}`}>
                        <div className="selection-checkbox">
                          <button
                            onClick={() => toggleQRLocationSelection(location.id)}
                            className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
                          >
                            {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </div>
                        <div className="qr-location-info">
                          <MapPin size={16} />
                          <span className="location-name">{location.name}</span>
                          <span className="location-type">{location.type}</span>
                          <div className="qr-code">
                            <QrCode size={14} />
                            {location.qrCode}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-secondary"
                onClick={() => setShowQRDialog(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={handleQRDialogGenerate}
                disabled={selectedQRLocations.size === 0}
              >
                <FileText size={16} />
                Generate QR Codes ({selectedQRLocations.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}