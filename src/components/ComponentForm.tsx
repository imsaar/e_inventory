import { useState, useEffect } from 'react';
import { X, Save, Trash2 } from 'lucide-react';
import { Component, StorageLocation } from '../types';

interface ComponentFormProps {
  component?: Component | null;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const CATEGORIES = [
  'Microcontrollers',
  'Sensors',
  'Motors',
  'Passive Components',
  'ICs',
  'Connectors',
  'Power Supplies',
  'Development Boards',
  'Tools',
  'Cables',
  'Other'
];

const SUBCATEGORIES: Record<string, string[]> = {
  'Sensors': ['Temperature', 'Pressure', 'Motion', 'Light', 'Gas', 'Magnetic', 'Sound', 'Distance'],
  'Motors': ['Servo', 'Stepper', 'DC Motor', 'Brushless'],
  'Passive Components': ['Resistors', 'Capacitors', 'Inductors', 'Diodes', 'LEDs'],
  'ICs': ['Logic', 'Amplifiers', 'Regulators', 'Converters', 'Memory'],
  'Connectors': ['Headers', 'Jumper Wires', 'USB', 'Audio', 'Power']
};

const PROTOCOLS = ['I2C', 'SPI', 'UART', 'PWM', 'Analog', 'Digital', 'CAN', 'Ethernet', 'WiFi', 'Bluetooth'];

export function ComponentForm({ component, onSave, onCancel, onDelete }: ComponentFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    partNumber: '',
    manufacturer: '',
    description: '',
    category: '',
    subcategory: '',
    tags: [] as string[],
    quantity: 0,
    minThreshold: 0,
    supplier: '',
    purchaseDate: '',
    unitCost: 0,
    totalCost: 0,
    locationId: '',
    status: 'available' as Component['status'],
    datasheetUrl: '',
    notes: '',
    voltage: { min: 0, max: 0, nominal: 0, unit: 'V' as const },
    current: { value: 0, unit: 'mA' as const },
    pinCount: 0,
    protocols: [] as string[],
    packageType: ''
  });

  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (component) {
      setFormData({
        name: component.name || '',
        partNumber: component.partNumber || '',
        manufacturer: component.manufacturer || '',
        description: component.description || '',
        category: component.category || '',
        subcategory: component.subcategory || '',
        tags: component.tags || [],
        quantity: component.quantity || 0,
        minThreshold: component.minThreshold || 0,
        supplier: component.supplier || '',
        purchaseDate: component.purchaseDate || '',
        unitCost: component.unitCost || 0,
        totalCost: component.totalCost || 0,
        locationId: component.locationId || '',
        status: component.status || 'available',
        datasheetUrl: component.datasheetUrl || '',
        notes: component.notes || '',
        voltage: component.voltage || { min: 0, max: 0, nominal: 0, unit: 'V' },
        current: component.current || { value: 0, unit: 'mA' },
        pinCount: component.pinCount || 0,
        protocols: component.protocols || [],
        packageType: component.packageType || ''
      });
    }
    loadLocations();
  }, [component]);

  const loadLocations = async () => {
    try {
      const response = await fetch('/api/locations');
      const data = await response.json();
      const flattenLocations = (locs: any[], prefix = ''): StorageLocation[] => {
        const result: StorageLocation[] = [];
        locs.forEach((loc: any) => {
          const displayName = prefix ? `${prefix} > ${loc.name}` : loc.name;
          result.push({ ...loc, name: displayName });
          if (loc.children && loc.children.length > 0) {
            result.push(...flattenLocations(loc.children, displayName));
          }
        });
        return result;
      };
      setLocations(flattenLocations(data));
    } catch (error) {
      console.error('Error loading locations:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const submitData = {
        ...formData,
        totalCost: formData.unitCost * formData.quantity,
        voltage: formData.voltage.min || formData.voltage.max ? formData.voltage : undefined,
        current: formData.current.value > 0 ? formData.current : undefined
      };

      const url = component 
        ? `/api/components/${component.id}` 
        : '/api/components';
      
      const method = component ? 'PUT' : 'POST';
      
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData)
      });

      onSave();
    } catch (error) {
      console.error('Error saving component:', error);
    }
  };

  const addTag = () => {
    if (newTag && !formData.tags.includes(newTag)) {
      setFormData({ ...formData, tags: [...formData.tags, newTag] });
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData({ 
      ...formData, 
      tags: formData.tags.filter(tag => tag !== tagToRemove) 
    });
  };

  const toggleProtocol = (protocol: string) => {
    const protocols = formData.protocols.includes(protocol)
      ? formData.protocols.filter(p => p !== protocol)
      : [...formData.protocols, protocol];
    setFormData({ ...formData, protocols });
  };

  const handleDelete = async () => {
    if (!component || !onDelete) return;
    
    if (confirm(`Are you sure you want to delete "${component.name}"? This action cannot be undone.`)) {
      try {
        await fetch(`/api/components/${component.id}`, {
          method: 'DELETE'
        });
        onDelete();
      } catch (error) {
        console.error('Error deleting component:', error);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>{component ? 'Edit Component' : 'Add New Component'}</h2>
          <button onClick={onCancel} className="btn-icon">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="component-form">
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Name *</label>
              <input
                type="text"
                className="form-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Part Number</label>
              <input
                type="text"
                className="form-input"
                value={formData.partNumber}
                onChange={(e) => setFormData({ ...formData, partNumber: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                className="form-select"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value, subcategory: '' })}
                required
              >
                <option value="">Select Category</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {formData.category && SUBCATEGORIES[formData.category] && (
              <div className="form-group">
                <label className="form-label">Subcategory</label>
                <select
                  className="form-select"
                  value={formData.subcategory}
                  onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
                >
                  <option value="">Select Subcategory</option>
                  {SUBCATEGORIES[formData.category].map(sub => (
                    <option key={sub} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Manufacturer</label>
              <input
                type="text"
                className="form-input"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input
                type="number"
                className="form-input"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Min Threshold</label>
              <input
                type="number"
                className="form-input"
                value={formData.minThreshold}
                onChange={(e) => setFormData({ ...formData, minThreshold: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Unit Cost ($)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                value={formData.unitCost || ''}
                onChange={(e) => setFormData({ ...formData, unitCost: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="form-actions">
            {component && onDelete && (
              <button 
                type="button" 
                onClick={handleDelete} 
                className="btn btn-danger"
                style={{ marginRight: 'auto' }}
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
            <button type="button" onClick={onCancel} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              <Save size={16} />
              Save Component
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}