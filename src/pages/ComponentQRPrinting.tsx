import { useState, useEffect } from 'react';
import { QrCode, Package, FileText, Square, CheckSquare, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Component } from '../types';

interface QRComponentData extends Component {
  printSize: 'tiny' | 'small' | 'medium' | 'large';
}

export function ComponentQRPrinting() {
  const [components, setComponents] = useState<QRComponentData[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadComponentsWithQR();
  }, []);

  const loadComponentsWithQR = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/components');
      if (!response.ok) {
        throw new Error('Failed to load components');
      }
      
      const data = await response.json();
      
      // Filter components that have QR generation enabled and add printSize
      const componentsWithQR = data
        .filter((component: Component) => component.generateQr)
        .map((component: Component) => ({
          ...component,
          printSize: component.qrSize || 'small' // Use saved size or default to small
        }));
        
      setComponents(componentsWithQR);
      
      // Select all components by default
      setSelectedComponents(new Set(componentsWithQR.map((comp: QRComponentData) => comp.id)));
    } catch (error) {
      console.error('Error loading components:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateComponentPrintSize = (componentId: string, size: 'tiny' | 'small' | 'medium' | 'large') => {
    setComponents(prev => 
      prev.map(comp => 
        comp.id === componentId 
          ? { ...comp, printSize: size }
          : comp
      )
    );
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
    setSelectedComponents(new Set(components.map(comp => comp.id)));
  };

  const clearSelection = () => {
    setSelectedComponents(new Set());
  };

  const getSizeDescription = (size: string) => {
    switch (size) {
      case 'tiny': return '8 per row - Perfect for small components';
      case 'small': return '6 per row - Good for most components';
      case 'medium': return '4 per row - Larger labels for easy reading';
      case 'large': return '3 per row - Maximum visibility';
      default: return '6 per row - Good for most components';
    }
  };

  const handleGenerateQRCodes = async () => {
    if (selectedComponents.size === 0) {
      alert('Please select at least one component to generate QR codes for.');
      return;
    }

    setGenerating(true);
    
    try {
      // Get all selected component IDs
      const selectedComponentIds = Array.from(selectedComponents);
      
      // Generate QR codes for all selected components in one mixed-size page
      const url = `/api/components/qr-codes/pdf/mixed?componentIds=${selectedComponentIds.join(',')}`;
      
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
      
      console.log(`QR codes generated for ${selectedComponentIds.length} components with mixed sizes`);
    } catch (error) {
      console.error('Error generating QR codes:', error);
      alert('Failed to generate QR codes. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading components...</div>;
  }

  return (
    <div className="qr-printing-page">
      <div className="page-header">
        <div className="header-title">
          <Link to="/components" className="back-button">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1>
              <QrCode size={24} />
              Component QR Code Printing
            </h1>
            <p className="page-subtitle">
              Configure and print QR codes for your components
            </p>
          </div>
        </div>
        
        <div className="header-actions">
          <div className="selection-summary">
            <span className="selected-count">
              {selectedComponents.size} of {components.length} components selected
            </span>
          </div>
          
          <div className="selection-controls">
            <button 
              className="btn btn-secondary btn-small"
              onClick={selectAllComponents}
              disabled={selectedComponents.size === components.length}
            >
              Select All
            </button>
            <button 
              className="btn btn-secondary btn-small"
              onClick={clearSelection}
              disabled={selectedComponents.size === 0}
            >
              Clear All
            </button>
          </div>
          
          <button 
            className="btn btn-primary"
            onClick={handleGenerateQRCodes}
            disabled={selectedComponents.size === 0 || generating}
          >
            <FileText size={20} />
            {generating ? 'Generating...' : `Generate QR Codes (${selectedComponents.size})`}
          </button>
        </div>
      </div>

      {components.length === 0 ? (
        <div className="empty-state">
          <Package size={64} />
          <h2>No Components with QR Generation Enabled</h2>
          <p>Components need to have QR generation enabled to appear here.</p>
          <Link to="/components" className="btn btn-primary">
            Manage Components
          </Link>
        </div>
      ) : (
        <div className="component-grid">
          {components.map(component => {
            const isSelected = selectedComponents.has(component.id);
            return (
              <div key={component.id} className={`component-card ${isSelected ? 'selected' : ''}`}>
                <div className="selection-checkbox">
                  <button
                    className="checkbox-button"
                    onClick={() => toggleComponentSelection(component.id)}
                  >
                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                </div>
                
                <div className="component-info">
                  <div className="component-header">
                    <h3 className="component-name">{component.name}</h3>
                    <div className="component-details">
                      <span className="component-category">{component.category}</span>
                      {component.partNumber && (
                        <span className="component-part-number">P/N: {component.partNumber}</span>
                      )}
                      {component.manufacturer && (
                        <span className="component-manufacturer">{component.manufacturer}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="print-size-control">
                    <label htmlFor={`size-${component.id}`} className="size-label">
                      QR Size:
                    </label>
                    <select
                      id={`size-${component.id}`}
                      value={component.printSize}
                      onChange={(e) => updateComponentPrintSize(component.id, e.target.value as 'tiny' | 'small' | 'medium' | 'large')}
                      className="size-select"
                      disabled={!isSelected}
                    >
                      <option value="tiny">Tiny</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                      <option value="large">Large</option>
                    </select>
                    <div className="size-description">
                      {getSizeDescription(component.printSize)}
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
            <li>Select components and adjust individual QR sizes as needed</li>
            <li>All selected components will be printed together, grouped by size</li>
            <li>Use your browser's print function (Ctrl+P) to print the QR labels</li>
            <li>For best results, use adhesive label sheets matching the grid layout</li>
          </ul>
        </div>
      </div>
    </div>
  );
}