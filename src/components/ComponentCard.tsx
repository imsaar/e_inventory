import { Edit, Trash2, ExternalLink, Square, CheckSquare, Eye } from 'lucide-react';
import { Component } from '../types';
import { LinkifiedText } from '../utils/linkify';

interface ComponentCardProps {
  component: Component;
  viewMode: 'grid' | 'list';
  onEdit: () => void;
  onDelete: () => void;
  onViewDetails?: () => void;
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}

export function ComponentCard({ component, viewMode, onEdit, onDelete, onViewDetails, bulkMode = false, isSelected = false, onToggleSelection }: ComponentCardProps) {
  const getQuantityClass = (quantity: number, minThreshold: number) => {
    if (quantity === 0) return 'out';
    if (quantity <= minThreshold) return 'low';
    return '';
  };

  const getStatusClass = (status: Component['status']) => {
    return `status-${status.replace('_', '')}`;
  };

  if (viewMode === 'list') {
    return (
      <div className={`component-list-item ${isSelected ? 'selected' : ''}`}>
        <div className="list-content">
          {bulkMode && (
            <div className="selection-checkbox">
              <button
                onClick={onToggleSelection}
                className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
              >
                {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              </button>
            </div>
          )}
          
          <div className="list-main">
            <div className="component-name">{component.name}</div>
            {component.partNumber && (
              <div className="component-part-number">{component.partNumber}</div>
            )}
          </div>
          
          <div className="list-details">
            <span className="component-category">{component.category}</span>
            {component.manufacturer && (
              <span className="manufacturer">{component.manufacturer}</span>
            )}
            <span className={`status-badge ${getStatusClass(component.status)}`}>
              {component.status.replace('_', ' ')}
            </span>
          </div>
          
          <div className="list-quantity">
            <span className={`quantity-badge ${getQuantityClass(component.quantity, component.minThreshold)}`}>
              {component.quantity}
            </span>
          </div>
          
          <div className="list-actions">
            {!bulkMode && (
              <>
                {onViewDetails && (
                  <button onClick={onViewDetails} className="btn-icon" title="View Details">
                    <Eye size={16} />
                  </button>
                )}
                <button onClick={onEdit} className="btn-icon" title="Edit">
                  <Edit size={16} />
                </button>
                <button onClick={onDelete} className="btn-icon danger" title="Delete">
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`component-card ${isSelected ? 'selected' : ''}`}>
      <div className="component-header">
        {bulkMode && (
          <div className="selection-checkbox">
            <button
              onClick={onToggleSelection}
              className={`checkbox-btn ${isSelected ? 'checked' : ''}`}
            >
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
          </div>
        )}
        
        <div>
          <div className="component-name">{component.name}</div>
          {component.partNumber && (
            <div className="component-part-number">{component.partNumber}</div>
          )}
        </div>
        
        <div className="card-actions">
          {!bulkMode && (
            <>
              {onViewDetails && (
                <button onClick={onViewDetails} className="btn-icon" title="View Details">
                  <Eye size={16} />
                </button>
              )}
              <button onClick={onEdit} className="btn-icon" title="Edit">
                <Edit size={16} />
              </button>
              <button onClick={onDelete} className="btn-icon danger" title="Delete">
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="component-category">{component.category}</div>
      
      {component.manufacturer && (
        <div className="component-manufacturer">{component.manufacturer}</div>
      )}

      {component.description && (
        <div className="component-description">
          <LinkifiedText>{component.description}</LinkifiedText>
        </div>
      )}

      <div className="component-details">
        {component.voltage && (
          <div className="component-detail">
            <span>Voltage:</span>
            <span>{component.voltage.nominal || component.voltage.min}-{component.voltage.max}V</span>
          </div>
        )}
        
        {component.protocols && component.protocols.length > 0 && (
          <div className="component-detail">
            <span>Protocols:</span>
            <span>{component.protocols.join(', ')}</span>
          </div>
        )}
        
        {component.packageType && (
          <div className="component-detail">
            <span>Package:</span>
            <span>{component.packageType}</span>
          </div>
        )}

        {component.unitCost && (
          <div className="component-detail">
            <span>Unit Cost:</span>
            <span>${component.unitCost.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div className="component-footer">
        <div className="quantity-info">
          <span className={`quantity-badge ${getQuantityClass(component.quantity, component.minThreshold)}`}>
            {component.quantity} units
          </span>
          {component.minThreshold > 0 && (
            <span className="min-threshold">Min: {component.minThreshold}</span>
          )}
        </div>
        
        <div className="status-info">
          <span className={`status-badge ${getStatusClass(component.status)}`}>
            {component.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {component.datasheetUrl && (
        <div className="component-links">
          <a 
            href={component.datasheetUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="datasheet-link"
          >
            <ExternalLink size={14} />
            Datasheet
          </a>
        </div>
      )}
    </div>
  );
}