import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import defaultDb from '../database';
import { AliExpressHTMLParser } from '../utils/aliexpressParser';
// import { authenticate } from '../middleware/auth'; // Removed for testing
import { validateImportRequest } from '../middleware/validation';

const router = express.Router();

// Request logging removed for production

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
    const allowedTypes = [
      'text/html',
      'message/rfc822',
      'application/x-mimearchive',
      'application/x-webarchive',
    ];
    const allowedExtensions = ['.html', '.mhtml', '.mht', '.webarchive'];
    const hasValidType = allowedTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));

    if (hasValidType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Only HTML, MHTML, and Safari .webarchive files are allowed'));
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
    // Read as Buffer so we can handle binary formats (Safari .webarchive).
    // The parser detects format from the buffer and converts to string for text formats.
    const htmlContent = await fs.readFile(htmlFilePath);
    
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
      statusUpdated: 0,
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
          // Check if order already exists. Keyed on order_number alone so a
          // seller renaming their AliExpress store doesn't slip past dedup.
          const existingOrder = db.prepare(`
            SELECT id, status FROM orders WHERE order_number = ?
          `).get(orderData.orderNumber) as { id: string; status: string } | undefined;

          if (existingOrder && !importOptions?.allowDuplicates) {
            // Re-import of a known order: update status if the freshly parsed
            // value differs (e.g. was "shipped" at first import, now "delivered").
            const incomingStatus = mapOrderStatus(orderData.status);
            if (
              incomingStatus &&
              incomingStatus !== existingOrder.status &&
              shouldUpdateStatus(existingOrder.status, incomingStatus)
            ) {
              db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(
                incomingStatus,
                new Date().toISOString(),
                existingOrder.id
              );
              results.statusUpdated++;
            }
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

      console.log(`Import completed: ${results.imported} imported, ${results.skipped} skipped, ${results.statusUpdated} statuses updated`);
      console.log(`Components created: ${results.componentIds.length}`);
      console.log(`Component IDs:`, results.componentIds);
      console.log(`Errors:`, results.errors);

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
 * Fetch the product title for a single AliExpress item by its product URL.
 * Used by the order edit form to enrich placeholder titles from multi-product
 * imports (where the My Orders page only renders thumbnails, not titles).
 *
 * Body: { productUrl: string, componentId?: string, orderItemId?: string }
 *  - If componentId is provided, the linked component's name is updated.
 *  - If orderItemId is provided, the order_items.product_title is updated.
 *
 * Response: { title, productId } on success, { error } on failure.
 *
 * Caveat: AliExpress aggressively blocks bots — this can return 502 if the
 * page comes back as a captcha / SPA shell. The frontend treats failures as
 * non-fatal and falls back to manual editing.
 */
router.post('/aliexpress/fetch-title', async (req, res) => {
  const { productUrl, componentId, orderItemId } = req.body || {};

  if (!productUrl || typeof productUrl !== 'string') {
    return res.status(400).json({ error: 'productUrl is required' });
  }

  let parsed: URL;
  try {
    parsed = new URL(productUrl);
  } catch {
    return res.status(400).json({ error: 'productUrl is not a valid URL' });
  }
  if (!/(^|\.)aliexpress\.(com|us|ru)$/i.test(parsed.hostname)) {
    return res.status(400).json({ error: 'Only AliExpress URLs are accepted' });
  }
  const idMatch = parsed.pathname.match(/\/item\/(\d+)\.html/);
  const productId = idMatch ? idMatch[1] : null;

  try {
    const { status, body: html } = await fetchAliExpressPage(productUrl);

    if (status < 200 || status >= 400) {
      return res.status(502).json({ error: `AliExpress returned HTTP ${status}` });
    }

    const title = extractAliExpressTitle(html);
    if (!title) {
      return res.status(502).json({ error: 'Could not extract a product title from the page (likely blocked by AliExpress anti-bot)' });
    }

    const db = getDb(req);
    const now = new Date().toISOString();
    if (componentId) {
      db.prepare('UPDATE components SET name = ?, updated_at = ? WHERE id = ?').run(title, now, componentId);
    }
    if (orderItemId) {
      db.prepare('UPDATE order_items SET product_title = ? WHERE id = ?').run(title, orderItemId);
    }

    res.json({ title, productId, success: true });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'Timed out fetching the AliExpress page' });
    }
    console.error('fetch-title error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch product title' });
  }
});

/**
 * Fetch an AliExpress page following redirects manually with cookie tracking.
 *
 * AliExpress bounces .com URLs through login.aliexpress.com/sync_cookie_read which
 * sets cookies on each hop and re-redirects. node-fetch's automatic redirect
 * follower hits its 20-redirect cap because it doesn't carry Set-Cookie forward
 * (no cookie jar). We do redirects manually and accumulate cookies so the
 * handshake completes and we land on the actual product page (often on
 * aliexpress.us for US visitors).
 */
async function fetchAliExpressPage(
  initialUrl: string,
  maxRedirects = 20,
  timeoutMs = 10000
): Promise<{ status: number; body: string; finalUrl: string }> {
  const cookieJar: Record<string, string> = {};
  let url = initialUrl;

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const cookieHeader = Object.entries(cookieJar)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      const response = await fetch(url, {
        signal: controller.signal as any,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      });

      // Accumulate Set-Cookie headers (name=value only; we ignore Path/Domain/Expires).
      const setCookies = (response.headers as any).raw?.()['set-cookie'] || [];
      for (const sc of setCookies as string[]) {
        const pair = sc.split(';')[0];
        const eq = pair.indexOf('=');
        if (eq > 0) {
          cookieJar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
        }
      }

      if (response.status >= 300 && response.status < 400) {
        const loc = response.headers.get('location');
        if (!loc) {
          return { status: response.status, body: await response.text(), finalUrl: url };
        }
        url = new URL(loc, url).toString();
        continue;
      }

      return { status: response.status, body: await response.text(), finalUrl: url };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Exceeded ${maxRedirects} redirects (last URL: ${url})`);
}

/**
 * Extract the product title from an AliExpress product page HTML.
 * Tries og:title first (most reliable), then twitter:title, then <title>.
 * Strips common AliExpress suffixes.
 */
function extractAliExpressTitle(html: string): string | null {
  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      let title = match[1].trim();
      // Strip common suffixes
      title = title.replace(/\s*[-|–]\s*AliExpress.*$/i, '');
      title = title.replace(/\s*\|\s*aliexpress\.com\s*$/i, '');
      title = decodeHtmlEntities(title);
      if (title && title.length > 3 && !/^aliexpress$/i.test(title)) {
        return title;
      }
    }
  }
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

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
  if (!item.parsedComponent) {
    return null;
  }

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
    try {
      const result = db.prepare(`
        INSERT INTO components (
          id, name, description, category, quantity, min_threshold, 
          image_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        componentId,
        component.name,
        component.description || null,
        component.category || 'Electronic Component',
        item.quantity || 0,
        0,
        item.localImagePath || item.imageUrl || null,
        'available',
        now,
        now
      );
      
      return componentId;
    } catch (error) {
      console.error('Error inserting component:', error);
      return null;
    }
  }
}

function mapOrderStatus(aliExpressStatus: string | undefined): string {
  if (!aliExpressStatus) return 'ordered';
  const status = aliExpressStatus.toLowerCase();
  if (status.includes('delivered') || status.includes('received')) return 'delivered';
  if (status.includes('shipped') || status.includes('transit')) return 'shipped';
  if (status.includes('pending') || status.includes('processing')) return 'pending';
  if (status.includes('cancelled')) return 'cancelled';
  return 'ordered';
}

// Decide whether an imported status should overwrite an existing one.
// Enforces forward progress through pending → ordered → shipped → delivered so
// re-importing a stale webarchive can't regress a delivered order. 'cancelled'
// is allowed in from anywhere (user cancelled) but a cancelled order won't
// revert to an earlier lifecycle state.
function shouldUpdateStatus(existing: string, incoming: string): boolean {
  if (existing === incoming) return false;
  if (incoming === 'cancelled') return true;
  if (existing === 'cancelled') return false;
  const rank: Record<string, number> = {
    pending: 0,
    ordered: 1,
    shipped: 2,
    delivered: 3,
  };
  const existingRank = rank[existing] ?? 0;
  const incomingRank = rank[incoming] ?? 0;
  return incomingRank > existingRank;
}

export default router;