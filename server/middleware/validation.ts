import { Request, Response, NextFunction } from 'express';
import { z, ZodError } from 'zod';

export interface ValidationError {
  field: string;
  message: string;
}

// Common validation schemas
export const schemas = {
  // ID validation - UUIDs or hex strings
  id: z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$/, 'Invalid ID format'),
  
  // Array of IDs with size limits to prevent DoS
  idArray: z.array(z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$/, 'Invalid ID format'))
    .min(1, 'Array cannot be empty')
    .max(100, 'Too many items (max 100)'),

  // String with length limits
  name: z.string().trim().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().max(2000, 'Description too long').optional(),
  
  // Component validation
  component: z.object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name too long'),
    partNumber: z.string().max(100, 'Part number too long').optional().or(z.literal('')),
    manufacturer: z.string().max(100, 'Manufacturer name too long').optional().or(z.literal('')),
    category: z.string().min(1, 'Category is required').max(100, 'Category too long'),
    subcategory: z.string().max(100, 'Subcategory too long').optional().or(z.literal('')),
    description: z.string().max(2000, 'Description too long').optional().or(z.literal('')),
    specifications: z.string().max(5000, 'Specifications too long').optional().or(z.literal('')),
    datasheet: z.string().url('Invalid datasheet URL').optional().or(z.literal('')),
    quantity: z.number().int().min(0, 'Quantity cannot be negative').max(1000000, 'Quantity too large'),
    minThreshold: z.number().int().min(0, 'Min threshold cannot be negative').max(1000000, 'Min threshold too large').optional(),
    status: z.enum(['available', 'on_order', 'in_use', 'reserved', 'needs_testing', 'defective']).optional(),
    notes: z.string().max(2000, 'Notes too long').optional().or(z.literal('')),
    tags: z.array(z.string().max(50, 'Tag too long')).max(10, 'Too many tags').optional(),
    unitCost: z.number().min(0, 'Unit cost cannot be negative').max(1000000, 'Unit cost too large').optional(),
    totalCost: z.number().min(0, 'Total cost cannot be negative').max(1000000, 'Total cost too large').optional(),
    locationId: z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$/, 'Invalid location ID').optional().or(z.literal('')),
    datasheetUrl: z.string().url('Invalid datasheet URL').optional().or(z.literal('')),
    packageType: z.string().optional().or(z.literal('')),
    imageUrl: z.string().max(500, 'Image URL too long').optional().or(z.literal('')),
    supplier: z.string().max(100, 'Supplier name too long').optional().or(z.literal('')),
    voltage: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      nominal: z.number().optional(),
      unit: z.string().optional()
    }).optional(),
    current: z.object({
      value: z.number().optional(),
      unit: z.string().optional()
    }).optional(),
    pinCount: z.number().int().min(0, 'Pin count cannot be negative').optional(),
    protocols: z.array(z.string().max(50, 'Protocol name too long')).max(20, 'Too many protocols').optional()
  }),

  // Location validation  
  location: z.object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name too long'),
    type: z.enum(['room', 'cabinet', 'drawer', 'box', 'shelf', 'bin']),
    parentId: z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$/, 'Invalid parent ID').optional().or(z.literal('')),
    description: z.string().max(2000, 'Description too long').optional().or(z.literal('')),
    qrCode: z.string().max(100, 'QR code too long').optional().or(z.literal('')),
    qrSize: z.enum(['small', 'medium', 'large']).optional(),
    photoUrl: z.string().max(500, 'Photo URL too long').optional().or(z.literal('')),
    generateQR: z.boolean().optional(),
    tags: z.array(z.string().max(50, 'Tag too long')).max(10, 'Too many tags').optional()
  }),

  // Project validation
  project: z.object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name too long'),
    description: z.string().max(2000, 'Description too long').optional().or(z.literal('')),
    status: z.enum(['planning', 'active', 'completed', 'on_hold']).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional().or(z.literal('')),
    completedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)').optional().or(z.literal('')),
    notes: z.string().max(2000, 'Notes too long').optional().or(z.literal('')),
    tags: z.array(z.string().max(50, 'Tag too long')).max(10, 'Too many tags').optional()
  }),

  // Search and filter validation
  search: z.object({
    term: z.string().max(100, 'Search term too long').optional(),
    category: z.string().max(100, 'Category too long').optional(),
    subcategory: z.string().max(100, 'Subcategory too long').optional(),
    manufacturer: z.string().max(100, 'Manufacturer too long').optional(),
    status: z.enum(['available', 'in_use', 'reserved', 'needs_testing', 'defective']).optional(),
    locationId: z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$/, 'Invalid location ID').optional(),
    locationName: z.string().max(100, 'Location name too long').optional(),
    minQuantity: z.number().int().min(0).max(1000000).optional(),
    maxQuantity: z.number().int().min(0).max(1000000).optional(),
    tags: z.array(z.string().max(50, 'Tag too long')).max(10, 'Too many tags').optional(),
    partNumber: z.string().max(100, 'Part number too long').optional(),
    sortBy: z.enum(['name', 'category', 'quantity', 'updated_at', 'created_at']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional()
  }),

  // Bulk delete validation
  bulkDelete: z.object({
    locationIds: z.array(z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$/, 'Invalid location ID'))
      .min(1, 'No locations selected')
      .max(100, 'Too many locations (max 100)')
      .optional(),
    componentIds: z.array(z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$|^cmp_[a-zA-Z0-9_]+$/, 'Invalid component ID'))
      .min(1, 'No components selected')
      .max(100, 'Too many components (max 100)')
      .optional(),
    projectIds: z.array(z.string().regex(/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$/, 'Invalid project ID'))
      .min(1, 'No projects selected')
      .max(100, 'Too many projects (max 100)')
      .optional()
  }).refine(data => 
    Boolean(data.locationIds || data.componentIds || data.projectIds), 
    'At least one type of item must be specified'
  )
};

// Generic validation middleware factory
export function validateSchema(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const validated = schema.parse(req.body);
      req.body = validated; // Replace with validated/sanitized data
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        console.log('Validation failed for request body:', JSON.stringify(req.body, null, 2));
        console.log('Validation errors:', error.issues);
        
        const validationErrors: ValidationError[] = error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        return res.status(400).json({
          error: 'Validation failed',
          details: validationErrors
        });
      }
      
      // Generic validation error
      return res.status(400).json({
        error: 'Invalid request data',
        details: []
      });
    }
  };
}

// Validate query parameters
export function validateQuery(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Convert query string numbers and arrays
      const query: any = { ...req.query };
      if (query.minQuantity) {
        query.minQuantity = parseInt(query.minQuantity as string);
      }
      // Handle tags array - can be comma-separated string or array
      if (query.tags) {
        if (typeof query.tags === 'string') {
          query.tags = query.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean);
        }
      }
      
      const validated = schema.parse(query);
      req.query = validated as any;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationErrors: ValidationError[] = error.issues.map((err: any) => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: validationErrors
        });
      }
      
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: []
      });
    }
  };
}

// Validate URL parameters
export function validateParams(paramNames: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];
    
    for (const param of paramNames) {
      const value = req.params[param];
      if (!value) {
        errors.push({
          field: param,
          message: `${param} parameter is required`
        });
      } else if (!/^[a-fA-F0-9]{32}$|^[a-fA-F0-9-]{36}$|^cmp_[a-zA-Z0-9_]+$/.test(value)) {
        errors.push({
          field: param,
          message: `Invalid ${param} format`
        });
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Invalid URL parameters',
        details: errors
      });
    }
    
    next();
  };
}

// Sanitize strings to prevent XSS while preserving URLs
export function sanitizeStrings(req: Request, res: Response, next: NextFunction) {
  function sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      // Don't escape forward slashes to preserve URLs
      return value
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    } else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return value.map(sanitizeValue);
      } else {
        const sanitized: any = {};
        for (const key in value) {
          sanitized[key] = sanitizeValue(value[key]);
        }
        return sanitized;
      }
    }
    return value;
  }
  
  if (req.body) {
    req.body = sanitizeValue(req.body);
  }
  
  next();
}

// Rate limiting for API endpoints
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    const record = rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
      rateLimitStore.set(key, {
        count: 1,
        resetTime: now + windowMs
      });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: [`Too many requests. Try again in ${Math.ceil((record.resetTime - now) / 1000)} seconds.`]
      });
    }
    
    record.count++;
    next();
  };
}

// Clean up rate limit store periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000); // Cleanup every 5 minutes

// Import validation schemas
const importRequestSchema = z.object({
  orders: z.array(z.object({
    orderNumber: z.string().min(1).max(50),
    orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}T/),
    totalAmount: z.number().min(0),
    supplier: z.string().min(1).max(100),
    status: z.string().min(1).max(20),
    items: z.array(z.object({
      productTitle: z.string().min(1).max(500),
      quantity: z.number().int().min(1).max(10000),
      unitPrice: z.number().min(0),
      totalPrice: z.number().min(0),
      imageUrl: z.string().url().optional(),
      localImagePath: z.string().max(500).optional(),
      productUrl: z.string().url().optional(),
      specifications: z.record(z.string(), z.string()).optional(),
      parsedComponent: z.object({
        name: z.string(),
        category: z.string(),
        subcategory: z.string().optional(),
        partNumber: z.string().optional(),
        manufacturer: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()),
        packageType: z.string().optional(),
        voltage: z.object({
          min: z.number().optional(),
          max: z.number().optional(),
          nominal: z.number().optional(),
          unit: z.string()
        }).optional(),
        current: z.object({
          value: z.number(),
          unit: z.string()
        }).optional(),
        resistance: z.object({
          value: z.number(),
          unit: z.string(),
          tolerance: z.string().optional()
        }).optional(),
        capacitance: z.object({
          value: z.number(),
          unit: z.string(),
          voltage: z.number().optional()
        }).optional(),
        frequency: z.object({
          value: z.number(),
          unit: z.string()
        }).optional(),
        pinCount: z.number().optional(),
        protocols: z.array(z.string())
      }).optional()
    })).max(1000) // Limit items per order
  })).max(100), // Limit number of orders per import
  importOptions: z.object({
    createComponents: z.boolean().default(true),
    updateExisting: z.boolean().default(true),
    allowDuplicates: z.boolean().default(false),
    matchByTitle: z.boolean().default(true)
  }).optional()
});

export const validateImportRequest = validateSchema(importRequestSchema);