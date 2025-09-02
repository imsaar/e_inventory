import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import defaultDb from '../database';
import { AliExpressHTMLParser } from '../utils/aliexpressParser';
// import { authenticate } from '../middleware/auth'; // Removed for testing
import { validateImportRequest } from '../middleware/validation';

const router = express.Router();

// Get database instance - support dependency injection for testing
function getDb(req: express.Request) {
  return (req.app.get('db') as any) || defaultDb;
}

// Test endpoint to verify routing
router.get('/test', (req, res) => {
  res.json({ message: 'Import routes working', timestamp: new Date().toISOString() });
});

// Configure multer for HTML file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = './uploads/imports';
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${timestamp}_${sanitized}`);
  }
});

const upload = multer({ 
  storage,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB limit for HTML files with images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/html', 'message/rfc822', 'application/x-mimearchive'];
    const allowedExtensions = ['.html', '.mhtml', '.mht'];
    const hasValidType = allowedTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    if (hasValidType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only HTML and MHTML files are allowed'));
    }
  }
});

/**
 * Parse AliExpress HTML file with real-time progress updates
 */
router.post('/aliexpress/preview', (req, res, next) => {
  upload.single('htmlFile')(req, res, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'HTML file is required' });
    }

    const htmlFilePath = req.file.path;
    const htmlContent = await fs.readFile(htmlFilePath, 'utf-8');
    
    // Set up SSE headers for progress updates
    if (req.headers.accept === 'text/event-stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      // Initialize parser with progress callback
      const parser = new AliExpressHTMLParser('./uploads/imported-images', (progress) => {
        res.write(`data: ${JSON.stringify(progress)}\n\n`);
      });
      
      try {
        console.log('Parsing AliExpress HTML file with progress:', req.file.originalname);
        const parsedOrders = await parser.parseOrderHTML(htmlContent);
        
        // Calculate statistics
        const stats = {
          totalOrders: parsedOrders.length,
          totalItems: parsedOrders.reduce((sum, order) => sum + order.items.length, 0),
          totalValue: parsedOrders.reduce((sum, order) => sum + order.totalAmount, 0),
          suppliers: [...new Set(parsedOrders.map(order => order.supplier))],
          dateRange: {
            earliest: parsedOrders.reduce((earliest, order) => 
              order.orderDate < earliest ? order.orderDate : earliest, 
              parsedOrders[0].orderDate
            ),
            latest: parsedOrders.reduce((latest, order) => 
              order.orderDate > latest ? order.orderDate : latest, 
              parsedOrders[0].orderDate
            )
          }
        };

        // Send final result
        res.write(`data: ${JSON.stringify({
          stage: 'complete',
          success: true,
          preview: parsedOrders,
          statistics: stats
        })}\n\n`);
        
        res.end();
        
      } catch (error) {
        res.write(`data: ${JSON.stringify({
          stage: 'error',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })}\n\n`);
        res.end();
      }
      
      // Clean up uploaded HTML file
      await fs.unlink(htmlFilePath);
      return;
    }

    // Fallback to regular JSON response for non-SSE requests
    const parser = new AliExpressHTMLParser('./uploads/imported-images');
    
    // Parse the HTML content
    console.log('Parsing AliExpress HTML file:', req.file.originalname);
    const parsedOrders = await parser.parseOrderHTML(htmlContent);
    
    // Clean up uploaded HTML file
    await fs.unlink(htmlFilePath);
    
    if (parsedOrders.length === 0) {
      return res.status(400).json({ 
        error: 'No orders found in HTML file. Please ensure this is a valid AliExpress order page.' 
      });
    }

    // Calculate statistics
    const stats = {
      totalOrders: parsedOrders.length,
      totalItems: parsedOrders.reduce((sum, order) => sum + order.items.length, 0),
      totalValue: parsedOrders.reduce((sum, order) => sum + order.totalAmount, 0),
      suppliers: [...new Set(parsedOrders.map(order => order.supplier))],
      dateRange: {
        earliest: parsedOrders.reduce((earliest, order) => 
          order.orderDate < earliest ? order.orderDate : earliest, 
          parsedOrders[0].orderDate
        ),
        latest: parsedOrders.reduce((latest, order) => 
          order.orderDate > latest ? order.orderDate : latest, 
          parsedOrders[0].orderDate
        )
      }
    };

    console.log(`Successfully parsed ${stats.totalOrders} orders with ${stats.totalItems} items`);

    res.json({
      success: true,
      preview: parsedOrders,
      statistics: stats
    });

  } catch (error) {
    console.error('Error parsing AliExpress HTML:', error);
    
    // More specific error handling
    let errorMessage = 'Failed to parse HTML file';
    let errorDetails = 'Unknown error';
    
    if (error instanceof Error) {
      errorDetails = error.message;
      if (error.message.includes('ENOENT')) {
        errorMessage = 'HTML file not found or could not be read';
      } else if (error.message.includes('Invalid HTML')) {
        errorMessage = 'Invalid or corrupted HTML file';
      } else if (error.message.includes('No orders found')) {
        errorMessage = 'No valid AliExpress orders found in HTML file';
      }
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      success: false
    });
  }
});

/**
 * Import parsed AliExpress orders into the database
 */
router.post('/aliexpress/import', async (req, res) => {
  try {
    const { orders, importOptions } = req.body;
    
    if (!orders || !Array.isArray(orders)) {
      return res.status(400).json({ error: 'Orders array is required' });
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
      orderIds: [] as string[],
      componentIds: [] as string[]
    };

    const db = getDb(req);
    
    // Begin transaction
    db.exec('BEGIN TRANSACTION');

    try {
      for (const orderData of orders) {
        try {
          // Check if order already exists
          const existingOrder = db.prepare(`
            SELECT id FROM orders WHERE order_number = ? AND supplier = ?
          `).get(orderData.orderNumber, orderData.supplier);

          if (existingOrder && !importOptions?.allowDuplicates) {
            results.skipped++;
            continue;
          }

          // Create order
          const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const now = new Date().toISOString();
          
          db.prepare(`
            INSERT INTO orders (
              id, order_date, supplier, order_number, supplier_order_id, notes, total_amount, 
              import_source, import_date, original_data, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            orderId,
            orderData.orderDate,
            orderData.supplier,
            orderData.orderNumber,
            orderData.orderNumber, // Use as supplier_order_id too
            `Imported from AliExpress HTML on ${now}`,
            orderData.totalAmount,
            'aliexpress',
            now,
            JSON.stringify(orderData), // Store original parsed data
            mapOrderStatus(orderData.status),
            now,
            now
          );

          results.orderIds.push(orderId);

          // Process order items
          for (const item of orderData.items) {
            try {
              let componentId: string | null = null;

              // Check if we should create/update component
              if (item.parsedComponent && importOptions?.createComponents !== false) {
                componentId = await createOrUpdateComponent(db, item, importOptions);
                if (componentId) {
                  results.componentIds.push(componentId);
                }
              }

              // Create order item with all detailed information
              const orderItemId = `oit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              
              // Calculate import confidence based on parsing success
              let importConfidence = 0.5; // Base confidence
              if (item.parsedComponent) {
                importConfidence += 0.3;
                if (item.parsedComponent.partNumber) importConfidence += 0.1;
                if (item.parsedComponent.category !== 'Electronic Component') importConfidence += 0.1;
              }
              importConfidence = Math.min(importConfidence, 1.0);

              // Determine if manual review is needed
              const needsReview = importConfidence < 0.7 || !componentId;
              
              db.prepare(`
                INSERT INTO order_items (
                  id, order_id, component_id, product_title, product_url, image_url, 
                  local_image_path, quantity, unit_cost, specifications, variation,
                  import_confidence, manual_review, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                orderItemId,
                orderId,
                componentId,
                item.productTitle,
                item.productUrl || null,
                item.imageUrl || null,
                item.localImagePath || null,
                item.quantity,
                item.unitPrice,
                item.specifications ? JSON.stringify(item.specifications) : null,
                item.specifications?.Variation || null,
                importConfidence,
                needsReview ? 1 : 0,
                item.parsedComponent ? `Auto-parsed as ${item.parsedComponent.category}` : 'Manual review required'
              );

            } catch (itemError) {
              console.error('Error processing order item:', itemError);
              results.errors.push(`Item "${item.productTitle}": ${itemError instanceof Error ? itemError.message : 'Unknown error'}`);
            }
          }

          results.imported++;

        } catch (orderError) {
          console.error('Error processing order:', orderError);
          results.errors.push(`Order ${orderData.orderNumber}: ${orderError instanceof Error ? orderError.message : 'Unknown error'}`);
        }
      }

      // Commit transaction
      db.exec('COMMIT');

      console.log(`Import completed: ${results.imported} orders imported, ${results.skipped} skipped`);

      res.json({
        success: true,
        results
      });

    } catch (error) {
      // Rollback on error
      db.exec('ROLLBACK');
      throw error;
    }

  } catch (error) {
    console.error('Error importing AliExpress orders:', error);
    res.status(500).json({ 
      error: 'Import failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get import history
 */
router.get('/history', (req, res) => {
  try {
    const db = getDb(req);
    
    const imports = db.prepare(`
      SELECT 
        'aliexpress' as source,
        COUNT(*) as orderCount,
        MIN(order_date) as earliestOrder,
        MAX(order_date) as latestOrder,
        SUM(total_amount) as totalValue,
        DATE(created_at) as importDate
      FROM orders 
      WHERE notes LIKE '%Imported from AliExpress HTML%'
      GROUP BY DATE(created_at)
      ORDER BY importDate DESC
    `).all();

    res.json(imports);

  } catch (error) {
    console.error('Error fetching import history:', error);
    res.status(500).json({ error: 'Failed to fetch import history' });
  }
});

// Helper functions

async function createOrUpdateComponent(db: any, item: any, options: any): Promise<string | null> {
  if (!item.parsedComponent) return null;

  const component = item.parsedComponent;
  
  // Check for existing component by title or part number
  let existingComponent = null;
  
  if (component.partNumber) {
    existingComponent = db.prepare(`
      SELECT id FROM components WHERE part_number = ?
    `).get(component.partNumber);
  }
  
  if (!existingComponent && options?.matchByTitle) {
    existingComponent = db.prepare(`
      SELECT id FROM components WHERE name = ?
    `).get(component.name);
  }

  const componentId = existingComponent?.id || `cmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  if (existingComponent) {
    // Update existing component with new information
    if (options?.updateExisting) {
      db.prepare(`
        UPDATE components SET
          description = COALESCE(?, description),
          image_url = COALESCE(?, image_url),
          quantity = quantity + ?,
          updated_at = ?
        WHERE id = ?
      `).run(component.description, item.localImagePath, item.quantity || 0, now, componentId);
    }
    return componentId;
  } else {
    // Create new component
    db.prepare(`
      INSERT INTO components (
        id, name, part_number, manufacturer, description, category, subcategory,
        tags, package_type, voltage, current, pin_count, protocols,
        quantity, min_threshold, image_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      componentId,
      component.name,
      component.partNumber || null,
      component.manufacturer || null,
      component.description || null,
      component.category,
      component.subcategory || null,
      JSON.stringify(component.tags),
      component.packageType || null,
      component.voltage ? JSON.stringify(component.voltage) : null,
      component.current ? JSON.stringify(component.current) : null,
      component.pinCount || null,
      JSON.stringify(component.protocols),
      item.quantity || 0, // Set quantity to the order quantity
      0, // Default minimum threshold to 0 (no threshold)
      item.localImagePath || item.imageUrl || null,
      'available',
      now,
      now
    );
    
    return componentId;
  }
}

function mapOrderStatus(aliExpressStatus: string): string {
  const status = aliExpressStatus.toLowerCase();
  if (status.includes('delivered') || status.includes('received')) return 'delivered';
  if (status.includes('shipped') || status.includes('transit')) return 'shipped';
  if (status.includes('pending') || status.includes('processing')) return 'pending';
  if (status.includes('cancelled')) return 'cancelled';
  return 'ordered';
}

export default router;