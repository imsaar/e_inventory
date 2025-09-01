export interface Component {
  id: string;
  name: string;
  partNumber?: string;
  manufacturer?: string;
  description?: string;
  category: string;
  subcategory?: string;
  tags: string[];
  
  // Physical properties
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    unit: 'mm' | 'cm' | 'in';
  };
  weight?: {
    value: number;
    unit: 'g' | 'kg' | 'oz' | 'lb';
  };
  packageType?: string;
  
  // Electrical specifications
  voltage?: {
    min?: number;
    max?: number;
    nominal?: number;
    unit: 'V' | 'mV';
  };
  current?: {
    value: number;
    unit: 'A' | 'mA' | 'µA';
  };
  pinCount?: number;
  protocols: string[];
  
  // Purchase and inventory
  quantity: number;
  minThreshold: number;
  supplier?: string;
  purchaseDate?: string;
  unitCost?: number;
  totalCost?: number;
  
  // Location and status
  locationId?: string;
  status: 'available' | 'in_use' | 'reserved' | 'needs_testing' | 'defective';
  
  // Documentation
  datasheetUrl?: string;
  imageUrl?: string;
  notes?: string;
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

export interface StorageLocation {
  id: string;
  name: string;
  type: 'room' | 'cabinet' | 'shelf' | 'drawer' | 'box' | 'compartment';
  parentId?: string;
  description?: string;
  qrCode?: string;
  qrSize?: 'small' | 'medium' | 'large';
  coordinates?: {
    x: number;
    y: number;
    z?: number;
  };
  photoUrl?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'planning' | 'active' | 'completed' | 'on_hold';
  startDate?: string;
  completedDate?: string;
  notes?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectComponent {
  id: string;
  projectId: string;
  componentId: string;
  quantityUsed: number;
  notes?: string;
  addedAt: string;
}

export interface ComponentHistory {
  id: string;
  componentId: string;
  action: 'added' | 'updated' | 'moved' | 'used' | 'returned' | 'tested';
  previousValue?: string;
  newValue?: string;
  quantity?: number;
  projectId?: string;
  notes?: string;
  timestamp: string;
}

export interface SearchFilters {
  term?: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  manufacturer?: string;
  status?: Component['status'];
  locationId?: string;
  locationName?: string;
  partNumber?: string;
  minVoltage?: number;
  maxVoltage?: number;
  protocols?: string[];
  minQuantity?: number;
  maxQuantity?: number;
  hasDatasheet?: boolean;
  sortBy?: 'name' | 'category' | 'quantity' | 'updated_at' | 'created_at' | 'location_name';
  sortOrder?: 'asc' | 'desc';
}

export interface BOM {
  id: string;
  projectId: string;
  name: string;
  components: {
    componentId: string;
    quantity: number;
    notes?: string;
  }[];
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
}