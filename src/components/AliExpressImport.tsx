import { useState, useCallback, useEffect } from 'react';
import { Upload, FileText, Package, DollarSign, Calendar, CheckCircle, AlertCircle, Eye, Settings } from 'lucide-react';
import { useDashboardRefresh } from '../hooks/useDashboardRefresh';

interface ParsedOrder {
  orderNumber: string;
  orderDate: string;
  totalAmount: number;
  supplier: string;
  status: string;
  items: ParsedOrderItem[];
}

interface ParsedOrderItem {
  productTitle: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  imageUrl?: string;
  localImagePath?: string;
  productUrl?: string;
  specifications?: Record<string, string>;
  parsedComponent?: any;
}

interface ImportStatistics {
  totalOrders: number;
  totalItems: number;
  totalValue: number;
  suppliers: string[];
  dateRange: {
    earliest: string;
    latest: string;
  };
}

interface ImportOptions {
  createComponents: boolean;
  updateExisting: boolean;
  allowDuplicates: boolean;
  matchByTitle: boolean;
}

interface AliExpressImportProps {
  onImportComplete?: (results: any) => void;
  onClose: () => void;
}

export function AliExpressImport({ onImportComplete, onClose }: AliExpressImportProps) {
  // const { pauseRefresh, resumeRefresh } = useDashboardRefresh();
  
  // Resume refresh when component unmounts (e.g., dialog closed)
  // useEffect(() => {
  //   return () => {
  //     resumeRefresh();
  //   };
  // }, [resumeRefresh]);
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<{
    orders: ParsedOrder[];
    statistics: ImportStatistics;
  } | null>(null);
  const [progressData, setProgressData] = useState<{
    stage: string;
    message: string;
    ordersFound?: number;
    currentOrder?: number;
    totalItems?: number;
    processedItems?: number;
    currentItem?: {
      productTitle: string;
      unitPrice: number;
      quantity: number;
      imageUrl?: string;
      localImagePath?: string;
      parsedComponent?: any;
    };
  } | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());
  const [showOptions, setShowOptions] = useState(false);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    createComponents: true,
    updateExisting: true,
    allowDuplicates: false,
    matchByTitle: true
  });
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<any>(null);
  const [importProgress, setImportProgress] = useState<{
    stage: string;
    message: string;
    completed: number;
    total: number;
  } | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const fileName = droppedFile.name.toLowerCase();
      const allowedTypes = ['text/html', 'message/rfc822', 'application/x-mimearchive'];
      const allowedExtensions = ['.html', '.mhtml', '.mht'];
      
      const hasValidType = allowedTypes.includes(droppedFile.type);
      const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
      
      if (hasValidType || hasValidExtension) {
        setFile(droppedFile);
      } else {
        alert('Please select an HTML or MHTML file');
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const parseHTML = async () => {
    if (!file) return;

    console.log('Starting parseHTML with file:', file.name);
    console.log('Auth token:', localStorage.getItem('token') ? 'Present' : 'Missing');

    setLoading(true);
    setProgressData(null);
    
    try {
      const formData = new FormData();
      formData.append('htmlFile', file);
      
      console.log('Making request to /api/import/aliexpress/preview');

      // Use fetch with SSE for progress tracking
      const response = await fetch('/api/import/aliexpress/preview', {
        method: 'POST',
        headers: {
          'Accept': 'text/event-stream'
        },
        body: formData
      });

      console.log('Response status:', response.status);
      console.log('Response content-type:', response.headers.get('content-type'));
      
      if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
        console.log('Using SSE stream processing');
        // Handle Server-Sent Events
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        
        if (reader) {
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.substring(6));
                  
                  if (data.stage === 'complete' && data.success) {
                    setPreviewData({
                      orders: data.preview,
                      statistics: data.statistics
                    });
                    setSelectedOrders(new Set(data.preview.map((order: ParsedOrder) => order.orderNumber)));
                    setLoading(false);
                    return; // Exit the parsing function
                  } else if (data.stage === 'error') {
                    throw new Error(data.error);
                  } else {
                    // Progress update
                    setProgressData(data);
                  }
                } catch (error) {
                  console.error('Error parsing SSE data:', error);
                }
              }
            }
          }
        }
      } else {
        console.log('SSE not available, using fallback request');
        // Fallback to regular request if SSE fails
        const fallbackResponse = await fetch('/api/import/aliexpress/preview', {
          method: 'POST',
          body: formData
        });

        const responseText = await fallbackResponse.text();
        
        if (!responseText) {
          throw new Error('Empty response from server');
        }

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (jsonError) {
          console.error('JSON parse error:', jsonError);
          throw new Error(`Invalid JSON response from server: ${responseText.substring(0, 200)}...`);
        }
        
        if (!fallbackResponse.ok) {
          throw new Error(data.error || data.details || 'Failed to parse HTML');
        }

        setPreviewData(data);
        setSelectedOrders(new Set(data.preview.map((order: ParsedOrder) => order.orderNumber)));
        setLoading(false);
      }
      
    } catch (error) {
      console.error('Error parsing HTML:', error);
      alert(`Error parsing HTML file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setLoading(false);
    }
  };

  const toggleOrderSelection = (orderNumber: string) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderNumber)) {
      newSelected.delete(orderNumber);
    } else {
      newSelected.add(orderNumber);
    }
    setSelectedOrders(newSelected);
  };

  const selectAllOrders = () => {
    if (!previewData) return;
    setSelectedOrders(new Set(previewData.orders.map(order => order.orderNumber)));
  };

  const clearSelection = () => {
    setSelectedOrders(new Set());
  };

  const performImport = async () => {
    if (!previewData || selectedOrders.size === 0) {
      return;
    }

    // Pause dashboard refresh during import
    // pauseRefresh();
    setImporting(true);
    setImportProgress(null);
    
    try {
      const selectedOrderData = previewData.orders.filter(order => 
        selectedOrders.has(order.orderNumber)
      );

      const totalItems = selectedOrderData.reduce((sum, order) => sum + order.items.length, 0);
      let processedItems = 0;

      // Simulate import progress (in a real implementation, this would come from the server)
      setImportProgress({
        stage: 'importing',
        message: 'Starting import process...',
        completed: 0,
        total: selectedOrderData.length
      });

      // Process orders in batches for better progress tracking
      const batchSize = 5;
      const batches = [];
      for (let i = 0; i < selectedOrderData.length; i += batchSize) {
        batches.push(selectedOrderData.slice(i, i + batchSize));
      }

      let allResults = { imported: 0, skipped: 0, errors: [], orderIds: [], componentIds: [] };

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        setImportProgress({
          stage: 'importing',
          message: `Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} orders)...`,
          completed: batchIndex,
          total: batches.length
        });

        const response = await fetch('/api/import/aliexpress/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orders: batch,
            importOptions
          })
        });
        
        const batchResults = await response.json();
        
        if (!response.ok) {
          throw new Error(batchResults.error || 'Import failed');
        }

        // Merge batch results
        allResults.imported += batchResults.results.imported;
        allResults.skipped += batchResults.results.skipped;
        allResults.errors.push(...batchResults.results.errors);
        allResults.orderIds.push(...batchResults.results.orderIds);
        allResults.componentIds.push(...batchResults.results.componentIds);
      }

      setImportProgress({
        stage: 'complete',
        message: `Import complete! Processed ${allResults.imported} orders with ${allResults.componentIds.length} components.`,
        completed: batches.length,
        total: batches.length
      });

      setImportResults(allResults);
      
      if (onImportComplete) {
        onImportComplete(allResults);
      }

    } catch (error) {
      console.error('Error importing orders:', error);
      setImportProgress({
        stage: 'error',
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        completed: 0,
        total: 0
      });
      alert(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setImporting(false);
      // Resume dashboard refresh after import completes
      // resumeRefresh();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  if (importResults) {
    return (
      <div className="modal-overlay">
        <div className="modal-content large-modal">
          <div className="modal-header">
            <h2>
              <CheckCircle size={24} style={{ color: '#4caf50' }} />
              Import Complete
            </h2>
            <button onClick={onClose} className="btn-icon">✕</button>
          </div>

          <div className="modal-body">
            <div className="import-results">
              <div className="results-summary">
                <div className="result-stat success">
                  <CheckCircle size={20} />
                  <div>
                    <div className="stat-value">{importResults.imported}</div>
                    <div className="stat-label">Orders Imported</div>
                  </div>
                </div>
                
                <div className="result-stat info">
                  <Package size={20} />
                  <div>
                    <div className="stat-value">{importResults.componentIds.length}</div>
                    <div className="stat-label">Components Created</div>
                  </div>
                </div>
                
                {importResults.skipped > 0 && (
                  <div className="result-stat warning">
                    <AlertCircle size={20} />
                    <div>
                      <div className="stat-value">{importResults.skipped}</div>
                      <div className="stat-label">Orders Skipped</div>
                    </div>
                  </div>
                )}
              </div>

              {importResults.errors.length > 0 && (
                <div className="import-errors">
                  <h4>Import Errors:</h4>
                  <ul>
                    {importResults.errors.map((error: string, index: number) => (
                      <li key={index} className="error-item">{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (previewData) {
    const selectedOrderData = previewData.orders.filter(order => 
      selectedOrders.has(order.orderNumber)
    );
    const selectedStats = {
      orders: selectedOrderData.length,
      items: selectedOrderData.reduce((sum, order) => sum + order.items.length, 0),
      value: selectedOrderData.reduce((sum, order) => sum + order.totalAmount, 0)
    };

    return (
      <div className="modal-overlay">
        <div className="modal-content extra-large-modal">
          <div className="modal-header">
            <h2>
              <FileText size={24} />
              Import Preview - AliExpress Orders
            </h2>
            <button onClick={onClose} className="btn-icon">✕</button>
          </div>

          <div className="modal-body">
            <div className="import-summary">
              <div className="summary-stats">
                <div className="stat-card">
                  <Package size={20} />
                  <div>
                    <div className="stat-value">{previewData.statistics.totalOrders}</div>
                    <div className="stat-label">Orders Found</div>
                  </div>
                </div>
                <div className="stat-card">
                  <FileText size={20} />
                  <div>
                    <div className="stat-value">{previewData.statistics.totalItems}</div>
                    <div className="stat-label">Total Items</div>
                  </div>
                </div>
                <div className="stat-card">
                  <DollarSign size={20} />
                  <div>
                    <div className="stat-value">{formatCurrency(previewData.statistics.totalValue)}</div>
                    <div className="stat-label">Total Value</div>
                  </div>
                </div>
                <div className="stat-card">
                  <Calendar size={20} />
                  <div>
                    <div className="stat-value">
                      {formatDate(previewData.statistics.dateRange.earliest)} - {formatDate(previewData.statistics.dateRange.latest)}
                    </div>
                    <div className="stat-label">Date Range</div>
                  </div>
                </div>
              </div>

              <div className="selection-controls">
                <div className="selection-info">
                  <span className="selected-count">
                    {selectedStats.orders} orders selected ({selectedStats.items} items, {formatCurrency(selectedStats.value)})
                  </span>
                </div>
                <div className="selection-actions">
                  <button 
                    className="btn btn-small btn-secondary"
                    onClick={selectAllOrders}
                    disabled={selectedOrders.size === previewData.orders.length}
                  >
                    Select All
                  </button>
                  <button 
                    className="btn btn-small btn-secondary"
                    onClick={clearSelection}
                    disabled={selectedOrders.size === 0}
                  >
                    Clear All
                  </button>
                  <button 
                    className="btn btn-small btn-secondary"
                    onClick={() => setShowOptions(!showOptions)}
                  >
                    <Settings size={16} />
                    Options
                  </button>
                </div>
              </div>

              {showOptions && (
                <div className="import-options">
                  <h4>Import Options</h4>
                  <div className="options-grid">
                    <label className="option-checkbox">
                      <input
                        type="checkbox"
                        checked={importOptions.createComponents}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          createComponents: e.target.checked
                        }))}
                      />
                      Create components from product titles
                    </label>
                    <label className="option-checkbox">
                      <input
                        type="checkbox"
                        checked={importOptions.updateExisting}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          updateExisting: e.target.checked
                        }))}
                      />
                      Update existing components
                    </label>
                    <label className="option-checkbox">
                      <input
                        type="checkbox"
                        checked={importOptions.allowDuplicates}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          allowDuplicates: e.target.checked
                        }))}
                      />
                      Allow duplicate orders
                    </label>
                    <label className="option-checkbox">
                      <input
                        type="checkbox"
                        checked={importOptions.matchByTitle}
                        onChange={(e) => setImportOptions(prev => ({
                          ...prev,
                          matchByTitle: e.target.checked
                        }))}
                      />
                      Match existing components by title
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="orders-preview">
              {previewData.orders.map(order => {
                const isSelected = selectedOrders.has(order.orderNumber);
                return (
                  <div 
                    key={order.orderNumber} 
                    className={`order-preview ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="order-preview-header">
                      <label className="order-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOrderSelection(order.orderNumber)}
                        />
                        <div className="order-info">
                          <h4>Order {order.orderNumber}</h4>
                          <div className="order-meta">
                            <span className="order-date">{formatDate(order.orderDate)}</span>
                            <span className="order-supplier">{order.supplier}</span>
                            <span className="order-total">{formatCurrency(order.totalAmount)}</span>
                            <span className={`order-status status-${order.status}`}>{order.status}</span>
                          </div>
                        </div>
                      </label>
                    </div>

                    <div className="order-items-preview">
                      {order.items.map((item, index) => (
                        <div key={index} className="item-preview">
                          {(item.localImagePath || item.imageUrl) && (
                            <div className="item-image">
                              <img 
                                src={item.localImagePath ? `/api/uploads/${item.localImagePath}` : item.imageUrl} 
                                alt={item.productTitle}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                          <div className="item-info">
                            <div className="item-title">{item.productTitle}</div>
                            <div className="item-details">
                              <span className="item-qty">Qty: {item.quantity}</span>
                              <span className="item-price">{formatCurrency(item.unitPrice)} each</span>
                              <span className="item-total">{formatCurrency(item.totalPrice)} total</span>
                            </div>
                            {item.parsedComponent && (
                              <div className="parsed-component">
                                <Eye size={14} />
                                <span>Will create: {item.parsedComponent.category} - {item.parsedComponent.subcategory || 'General'}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {importing && importProgress && (
            <div className="parsing-progress">
              <div className="progress-header">
                <h3>Importing Orders to Database</h3>
                <div className="progress-stage" data-stage={importProgress.stage}>
                  {importProgress.stage.charAt(0).toUpperCase() + importProgress.stage.slice(1)}
                </div>
              </div>
              
              <div className="progress-message">
                {importProgress.message}
              </div>

              <div className="progress-stats">
                <div className="stat-item">
                  <strong>Progress:</strong> {importProgress.completed} of {importProgress.total} batches
                </div>
                {importProgress.total > 0 && (
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${(importProgress.completed / importProgress.total) * 100}%` 
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button 
              className="btn btn-secondary" 
              onClick={() => setPreviewData(null)}
              disabled={importing}
            >
              Back
            </button>
            <button 
              className="btn btn-primary"
              onClick={performImport}
              disabled={selectedOrders.size === 0 || importing}
            >
              {importing ? 'Importing...' : `Import ${selectedStats.orders} Orders`}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>
            <Upload size={24} />
            Import AliExpress Orders
          </h2>
          <button onClick={onClose} className="btn-icon">✕</button>
        </div>

        <div className="modal-body">
          <div className="import-instructions">
            <h3>How to import your AliExpress orders:</h3>
            <ol>
              <li>Go to AliExpress → Account → My Orders</li>
              <li>Load all the orders you want to import (scroll down to load more)</li>
              <li><strong>Chrome (Recommended):</strong> Right-click → "Save As" → "Webpage, Single File" (.mhtml)</li>
              <li><strong>Other browsers:</strong> Right-click → "Save As" → "Webpage, Complete" (.html + folder)</li>
              <li>Upload the saved file below</li>
            </ol>
            <div className="format-benefits">
              <p><strong>💡 Pro Tip:</strong> MHTML format (Chrome) includes all product images in a single file, making import faster and more reliable than HTML with separate image files!</p>
            </div>
          </div>

          <div 
            className={`file-drop-zone ${dragActive ? 'drag-active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="drop-content">
              <FileText size={48} />
              <h3>Drop your AliExpress file here</h3>
              <p className="drop-description">Supports HTML and MHTML formats</p>
              <div className="file-upload-options">
                <span className="upload-separator">or</span>
                <input
                  type="file"
                  accept=".html,.mhtml,.mht"
                  onChange={handleFileChange}
                  className="file-input"
                  id="file-upload-input"
                />
                <label htmlFor="file-upload-input" className="btn btn-secondary browse-button">
                  <Upload size={16} />
                  Browse Files
                </label>
              </div>
            </div>
          </div>

          {file && (
            <div className="selected-file">
              <FileText size={20} />
              <span className="file-name">{file.name}</span>
              <span className="file-size">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
            </div>
          )}

          {loading && progressData && (
            <div className="parsing-progress">
              <div className="progress-header">
                <h3>Parsing AliExpress Orders</h3>
                <div className="progress-stage">
                  Stage: {progressData.stage.charAt(0).toUpperCase() + progressData.stage.slice(1)}
                </div>
              </div>
              
              <div className="progress-message">
                {progressData.message}
              </div>

              {progressData.ordersFound !== undefined && (
                <div className="progress-stats">
                  <div className="stat-item">
                    <strong>Orders Found:</strong> {progressData.ordersFound}
                  </div>
                  {progressData.currentOrder && (
                    <div className="stat-item">
                      <strong>Processing:</strong> Order {progressData.currentOrder} of {progressData.ordersFound}
                    </div>
                  )}
                </div>
              )}

              {progressData.totalItems !== undefined && (
                <div className="progress-stats">
                  <div className="stat-item">
                    <strong>Items Found:</strong> {progressData.totalItems}
                  </div>
                  {progressData.processedItems && (
                    <div className="stat-item">
                      <strong>Processed:</strong> {progressData.processedItems} of {progressData.totalItems}
                    </div>
                  )}
                  {progressData.processedItems && progressData.totalItems && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ 
                          width: `${(progressData.processedItems / progressData.totalItems) * 100}%` 
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Current Item Preview */}
              {progressData.currentItem && (
                <div className="current-item-preview">
                  <h4>Currently Processing:</h4>
                  <div className="item-preview-card">
                    {progressData.currentItem.localImagePath && (
                      <div className="item-image-preview">
                        <img 
                          src={`/api/uploads/${progressData.currentItem.localImagePath}`} 
                          alt={progressData.currentItem.productTitle}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    {!progressData.currentItem.localImagePath && progressData.currentItem.imageUrl && (
                      <div className="item-image-preview">
                        <img 
                          src={progressData.currentItem.imageUrl} 
                          alt={progressData.currentItem.productTitle}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                    <div className="item-details-preview">
                      <div className="item-title-preview">{progressData.currentItem.productTitle}</div>
                      <div className="item-meta-preview">
                        <span className="item-quantity">Qty: {progressData.currentItem.quantity}</span>
                        <span className="item-price">${progressData.currentItem.unitPrice.toFixed(2)} each</span>
                      </div>
                      {progressData.currentItem.parsedComponent && (
                        <div className="parsed-component-preview">
                          <Eye size={14} />
                          <span>
                            {progressData.currentItem.parsedComponent.category}
                            {progressData.currentItem.parsedComponent.subcategory && 
                              ` - ${progressData.currentItem.parsedComponent.subcategory}`
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary"
            onClick={parseHTML}
            disabled={!file || loading}
          >
            {loading ? 'Parsing...' : 'Parse HTML'}
          </button>
        </div>
      </div>
    </div>
  );
}