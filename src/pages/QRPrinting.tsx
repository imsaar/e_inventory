import { useState, useEffect } from 'react';
import { QrCode, MapPin, FileText, Square, CheckSquare, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StorageLocation } from '../types';

interface QRLocationData extends StorageLocation {
  printSize: 'small' | 'medium' | 'large';
}

export function QRPrinting() {
  const [locations, setLocations] = useState<QRLocationData[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadLocationsWithQR();
  }, []);

  const loadLocationsWithQR = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/locations');
      if (!response.ok) {
        throw new Error('Failed to load locations');
      }
      
      const data = await response.json();
      
      // Flatten the hierarchical structure and filter locations with QR codes
      const flatLocations = flattenLocations(data);
      const locationsWithQR = flatLocations
        .filter(location => location.qrCode)
        .map(location => ({
          ...location,
          printSize: location.qrSize || 'medium' // Use saved size or default to medium
        }));
        
      setLocations(locationsWithQR);
      
      // Select all locations by default
      setSelectedLocations(new Set(locationsWithQR.map(loc => loc.id)));
    } catch (error) {
      console.error('Error loading locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const flattenLocations = (locationTree: any[]): StorageLocation[] => {
    const flat: StorageLocation[] = [];
    const flatten = (locations: any[]) => {
      locations.forEach(location => {
        flat.push(location);
        if (location.children && location.children.length > 0) {
          flatten(location.children);
        }
      });
    };
    flatten(locationTree);
    return flat;
  };

  const updateLocationPrintSize = (locationId: string, size: 'small' | 'medium' | 'large') => {
    setLocations(prev => 
      prev.map(loc => 
        loc.id === locationId 
          ? { ...loc, printSize: size }
          : loc
      )
    );
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
    setSelectedLocations(new Set(locations.map(loc => loc.id)));
  };

  const clearSelection = () => {
    setSelectedLocations(new Set());
  };


  const getSizeDescription = (size: string) => {
    switch (size) {
      case 'small': return '6 per row - Good for small containers';
      case 'medium': return '4 per row - Default size for most locations';
      case 'large': return '3 per row - Good for main areas and walls';
      default: return '4 per row - Default size for most locations';
    }
  };

  const handleGenerateQRCodes = async () => {
    if (selectedLocations.size === 0) {
      alert('Please select at least one location to generate QR codes for.');
      return;
    }

    setGenerating(true);
    
    try {
      // Group selected locations by their print size
      const locationsBySize = new Map<string, string[]>();
      
      locations
        .filter(loc => selectedLocations.has(loc.id))
        .forEach(loc => {
          const size = loc.printSize;
          if (!locationsBySize.has(size)) {
            locationsBySize.set(size, []);
          }
          locationsBySize.get(size)!.push(loc.id);
        });

      // Generate QR codes for each size group
      for (const [size, locationIds] of locationsBySize) {
        const url = `/api/locations/qr-codes/pdf?size=${size}&locationIds=${locationIds.join(',')}`;
        
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
      }
      
      // Allow windows to load without showing alert
      setTimeout(() => {
        // Windows will open automatically, user can print manually
        console.log(`QR codes opened in ${locationsBySize.size} window${locationsBySize.size > 1 ? 's' : ''} (grouped by size)`);
      }, 500);
      
    } catch (error) {
      console.error('Error generating QR codes:', error);
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Error generating QR codes:\n\n${message}`);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading locations with QR codes...</div>;
  }

  return (
    <div className="qr-printing-page">
      <div className="page-header">
        <div className="header-title">
          <Link to="/locations" className="back-button">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1>
              <QrCode size={24} />
              QR Code Printing
            </h1>
            <p className="page-subtitle">
              Configure and print QR codes for your storage locations
            </p>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="selection-summary">
            <span className="selected-count">
              {selectedLocations.size} of {locations.length} locations selected
            </span>
          </div>
          
          <div className="selection-controls">
            <button 
              className="btn btn-secondary btn-small"
              onClick={selectAllLocations}
              disabled={selectedLocations.size === locations.length}
            >
              Select All
            </button>
            <button 
              className="btn btn-secondary btn-small"
              onClick={clearSelection}
              disabled={selectedLocations.size === 0}
            >
              Clear All
            </button>
          </div>
          
          <button 
            className="btn btn-primary"
            onClick={handleGenerateQRCodes}
            disabled={selectedLocations.size === 0 || generating}
          >
            <FileText size={20} />
            {generating ? 'Generating...' : `Generate QR Codes (${selectedLocations.size})`}
          </button>
        </div>
      </div>

      {locations.length === 0 ? (
        <div className="empty-state">
          <QrCode size={48} />
          <h3>No QR Codes Found</h3>
          <p>No locations with QR codes were found. Create locations with QR codes first.</p>
          <Link to="/locations" className="btn btn-primary">
            <MapPin size={20} />
            Go to Locations
          </Link>
        </div>
      ) : (
        <div className="qr-locations-grid">
          {locations.map(location => {
            const isSelected = selectedLocations.has(location.id);
            
            return (
              <div 
                key={location.id} 
                className={`qr-location-card ${isSelected ? 'selected' : ''}`}
              >
                <div className="location-card-header">
                  <div className="selection-checkbox">
                    <button
                      onClick={() => toggleLocationSelection(location.id)}
                      className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
                    >
                      {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                    </button>
                  </div>
                  
                  <div className="location-header-info">
                    <div className="location-name-section">
                      <MapPin size={16} />
                      <h3 className="location-name">{location.name}</h3>
                    </div>
                    <span className="location-type">{location.type}</span>
                  </div>
                </div>

                <div className="location-card-body">
                  <div className="qr-info">
                    <div className="qr-code-display">
                      <QrCode size={16} />
                      <span className="qr-code-text">{location.qrCode}</span>
                    </div>
                    
                    {location.description && (
                      <div className="location-description">
                        {location.description}
                      </div>
                    )}
                  </div>

                  <div className="print-size-section">
                    <label className="size-label">
                      Print Size:
                    </label>
                    <select
                      value={location.printSize}
                      onChange={(e) => updateLocationPrintSize(location.id, e.target.value as 'small' | 'medium' | 'large')}
                      className="size-select"
                      disabled={!isSelected}
                    >
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                    <div className="size-description">
                      {getSizeDescription(location.printSize)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="qr-printing-footer">
        <div className="printing-info">
          <h3>Printing Instructions</h3>
          <ul>
            <li>QR codes will be grouped by size and opened in separate browser windows</li>
            <li>Each window contains printable QR labels optimized for that size</li>
            <li>Use your browser's print function (Ctrl+P) to print each page</li>
            <li>For best results, use adhesive label sheets matching the grid layout</li>
          </ul>
        </div>
      </div>
    </div>
  );
}