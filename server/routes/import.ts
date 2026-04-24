import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import defaultDb from '../database';
import { AliExpressHTMLParser } from '../utils/aliexpressParser';
import { AmazonHTMLParser } from '../utils/amazonParser';
import { parsePackSize } from '../utils/packSize';
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
              // Detected pack size (e.g. "10 PCS" → 10). 1 means no multipack.
              // The component's inventory contribution = quantity × pack_size.
              const variationText = item.specifications?.Variation || item.variation;
              const packSize = parsePackSize(item.productTitle, variationText);

              let componentId: string | null = null;
              if (item.parsedComponent && importOptions?.createComponents !== false) {
                componentId = await createOrUpdateComponent(db, { ...item, packSize }, importOptions);
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
                  local_image_path, quantity, unit_cost, pack_size, specifications, variation,
                  import_confidence, manual_review, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                packSize,
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
/**
 * Enrich an existing order with per-item details parsed from an uploaded
 * AliExpress order DETAIL page webarchive/MHTML/HTML. Targets multi-product
 * orders imported from the My Orders list, which only carry placeholder
 * titles / evenly-split unit prices / qty=1 because the list page doesn't
 * render those fields.
 *
 * Flow:
 *   1. Read the upload as a Buffer (binary-safe for .webarchive).
 *   2. AliExpressHTMLParser.parseOrderDetail extracts per-product rows with
 *      { productId, productUrl, productTitle, quantity, unitPrice }.
 *   3. Match each incoming row to an existing order_items row by the
 *      numeric product ID in product_url. Update product_title, quantity,
 *      unit_cost, total_cost, and local_image_path (if we learned a new
 *      image). Bump the linked component's name + image_url too, since
 *      placeholder components were literally named "AliExpress item <id>".
 *   4. Return { matched, updated, unmatched } counts plus the IDs so the
 *      frontend can show a summary and reload.
 */
router.post('/aliexpress/enrich-order/:orderId', (req, res, next) => {
  upload.single('detailFile')(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const { orderId } = req.params;
  let tempFilePath: string | null = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'detailFile is required' });
    }
    tempFilePath = req.file.path;
    const db = getDb(req);

    // Verify the order exists before doing any work.
    const order = db.prepare('SELECT id, order_number FROM orders WHERE id = ?').get(orderId) as
      { id: string; order_number: string | null } | undefined;
    if (!order) {
      return res.status(404).json({ error: `Order ${orderId} not found` });
    }

    // Parse the detail page.
    const fileBuffer = await fs.readFile(tempFilePath);
    const parser = new AliExpressHTMLParser('./uploads/imported-images');
    const {
      orderNumber: detailOrderNumber,
      items: detailItems,
      subtotal: detailSubtotal,
      total: rawDetailTotal,
      bonus: detailBonus,
      tax: detailTax,
    } = await parser.parseOrderDetail(fileBuffer);
    // orderDate / sellerName available on the returned object too, used by
    // the sibling /create-from-detail endpoint. The enrich endpoint doesn't
    // overwrite them on the existing order.

    // If the detail page's Total exceeds its Subtotal and no tax row was
    // captured (common when the breakdown section was left collapsed while
    // saving the webarchive), the overage is almost certainly untagged
    // tax. Clamp Total down to Subtotal so item unit costs don't get
    // silently inflated. The real tax can be entered manually after import.
    let detailTotal = rawDetailTotal;
    if (detailSubtotal && detailTotal && !detailTax && detailSubtotal < detailTotal) {
      detailTotal = detailSubtotal;
    }

    // Cost decomposition:
    //   item_cost (post-discount, pre-tax) = total + bonus − tax
    //   orders.total_amount (full acquired value)       = item_cost + tax
    //                                                   = total + bonus
    // Bonus (gift-card balance from prior refunds) is the user's own money
    // and doesn't lower item cost. Tax ("Additional charges") is above
    // item cost and is stored separately on the order.
    const taxAmount = detailTax ?? 0;
    const itemsCost = Math.max(0, (detailTotal ?? 0) + (detailBonus ?? 0) - taxAmount) || detailTotal || 0;
    const effectiveTotal = itemsCost + taxAmount;

    // Reject if the uploaded detail page is for a different order. Guards
    // the user against accidentally enriching the wrong order.
    if (detailOrderNumber && order.order_number && detailOrderNumber !== order.order_number) {
      return res.status(409).json({
        error: `Uploaded detail page is for order ${detailOrderNumber}, but you are editing order ${order.order_number}. Re-save the correct order's detail page and try again.`,
      });
    }

    if (detailItems.length === 0) {
      return res.status(422).json({
        error: 'Could not extract any items from the uploaded detail page. Make sure you saved the order DETAIL page (click into an order), not the My Orders list.',
      });
    }

    // Fetch existing order_items with their product URLs + linked components.
    // quantity + pack_size are needed so enrichment can re-sync
    // components.quantity by the (new - old) units-in-stock delta.
    const existingItems = db.prepare(`
      SELECT id, component_id, product_url, image_url, local_image_path,
             quantity, pack_size
      FROM order_items
      WHERE order_id = ?
    `).all(orderId) as Array<{
      id: string;
      component_id: string | null;
      product_url: string | null;
      image_url: string | null;
      local_image_path: string | null;
      quantity: number | null;
      pack_size: number | null;
    }>;

    // Matching strategy:
    //   Pass 1 — group both detail items and existing rows by product ID,
    //            pair them positionally within each group. Supports the
    //            common case of multiple SKU variants under one product ID
    //            (e.g. 7 color variants of the same jumper-wire product).
    //   Pass 2 — pair any still-unmatched detail items with existing rows
    //            whose product_url doesn't carry a parseable ID ("AliExpress
    //            item unknown-N" placeholder rows from the original multi-
    //            item parser where the href couldn't be read).
    const extractId = (url: string | null) => {
      const m = (url || '').match(/\/item\/(\d+)\.html/);
      return m ? m[1] : null;
    };
    const rowsByProductId = new Map<string, typeof existingItems>();
    const orphanRows: typeof existingItems = [];
    for (const item of existingItems) {
      const id = extractId(item.product_url);
      if (id) {
        if (!rowsByProductId.has(id)) rowsByProductId.set(id, []);
        rowsByProductId.get(id)!.push(item);
      } else {
        orphanRows.push(item);
      }
    }

    const detailsByProductId = new Map<string, typeof detailItems>();
    for (const d of detailItems) {
      if (!detailsByProductId.has(d.productId)) detailsByProductId.set(d.productId, []);
      detailsByProductId.get(d.productId)!.push(d);
    }

    type Pair = { detail: typeof detailItems[0]; row: typeof existingItems[0] };
    const pairs: Pair[] = [];
    const leftoverDetails: typeof detailItems = [];
    const claimedRowIds = new Set<string>();

    for (const [productId, details] of detailsByProductId) {
      const rows = rowsByProductId.get(productId) || [];
      for (let i = 0; i < details.length; i++) {
        if (i < rows.length) {
          pairs.push({ detail: details[i], row: rows[i] });
          claimedRowIds.add(rows[i].id);
        } else {
          leftoverDetails.push(details[i]);
        }
      }
    }

    // Spread real discount (store discount + coin credit) across items
    // proportionally so sum(qty × effective unit_cost) equals itemsCost
    // (post-discount, pre-tax). Tax is stored separately on the order.
    const discountFactor = (
      detailSubtotal && itemsCost && detailSubtotal > 0 && itemsCost > 0 && itemsCost < detailSubtotal
    ) ? itemsCost / detailSubtotal : 1;

    // If there's a subtotal-total gap but no breakdown rows came through,
    // the user almost certainly saved the page with the "Total" section
    // collapsed — the Store discount / Coin credit / Additional charges /
    // Bonus rows only render after clicking the expand arrow.
    const warnings: string[] = [];
    const gap = detailSubtotal && detailTotal ? detailSubtotal - detailTotal : 0;
    if (gap > 0.01 && !detailTax && !detailBonus) {
      warnings.push(
        `Subtotal ($${detailSubtotal!.toFixed(2)}) exceeds Total ($${detailTotal!.toFixed(2)}) by $${gap.toFixed(2)}, but no Store discount / Coin credit / Additional charges / Bonus rows were found on the page. Expand the "Total" section on AliExpress (click the arrow next to Total) before saving the webarchive so the breakdown renders in the DOM — without it, tax and bonus can't be attributed correctly.`
      );
    }
    if (rawDetailTotal !== detailTotal) {
      warnings.push(
        `Total on the detail page ($${rawDetailTotal!.toFixed(2)}) exceeded Subtotal ($${detailSubtotal!.toFixed(2)}) with no tax row present — clamped Total to Subtotal to avoid silently inflating item cost. Re-save with the breakdown expanded to capture the actual tax.`
      );
    }

    const results = {
      detailItems: detailItems.length,
      matched: 0,
      updated: 0,
      created: 0,
      componentsRenamed: 0,
      pairedByFallback: 0,
      subtotal: detailSubtotal,
      total: detailTotal,
      bonus: detailBonus,
      tax: taxAmount,
      itemsCost,
      effectiveTotal,
      discountFactor,
      warnings,
      unmatched: [] as Array<{ productId: string; productTitle: string }>,
      orderItemIds: [] as string[],
    };

    // Pass 2: pair leftover detail items with orphan rows positionally.
    // Items still unpaired after this will be INSERTed as new order_items
    // in the transaction below — the detail page is authoritative, so if
    // the order has more items than the My Orders list originally showed,
    // we fill in the missing ones rather than discard them.
    const leftoverAfterOrphans: typeof detailItems = [];
    for (let i = 0; i < leftoverDetails.length; i++) {
      const row = orphanRows[i];
      const detail = leftoverDetails[i];
      if (!row) {
        leftoverAfterOrphans.push(detail);
        continue;
      }
      pairs.push({ detail, row });
      results.pairedByFallback++;
    }

    db.exec('BEGIN TRANSACTION');
    try {
      const now = new Date().toISOString();
      for (const { detail, row } of pairs) {
        results.matched++;

        // Scale raw list price by the order-wide discount factor so line
        // totals sum to what was actually paid. Round to 4 decimals — the
        // table stores REAL so anything more is noise.
        const effectiveUnitCost = Math.round(detail.unitPrice * discountFactor * 10000) / 10000;

        // Pack-size detection uses title AND variation (AliExpress often
        // puts the chosen pack in the SKU variant like "30PCS" or "5 sets").
        // Compute old vs new units-in-stock so we can rebalance the linked
        // component's quantity below.
        const newPackSize = parsePackSize(detail.productTitle, detail.variation);
        const oldUnits = (Number(row.quantity) || 0) * (Number(row.pack_size) || 1);
        const newUnits = (Number(detail.quantity) || 0) * newPackSize;
        const unitsDelta = newUnits - oldUnits;

        // total_cost is GENERATED from quantity * unit_cost, so it's
        // omitted from the UPDATE. product_url / variation are backfilled
        // so orphan "AliExpress item unknown-N" rows become matchable on
        // future enrichments.
        db.prepare(`
          UPDATE order_items
          SET product_title = ?,
              quantity = ?,
              unit_cost = ?,
              list_unit_cost = ?,
              pack_size = ?,
              product_url = COALESCE(?, product_url),
              variation = COALESCE(?, variation),
              local_image_path = COALESCE(?, local_image_path),
              manual_review = 0
          WHERE id = ?
        `).run(
          detail.productTitle,
          detail.quantity,
          effectiveUnitCost,
          detail.unitPrice,
          newPackSize,
          detail.productUrl || null,
          detail.variation || null,
          detail.localImagePath || null,
          row.id
        );
        results.orderItemIds.push(row.id);
        results.updated++;

        // The detail page is authoritative — rename the linked component,
        // fill in its image if missing, and rebalance its quantity by the
        // units delta. When a row has no linked component (shouldn't
        // happen with the current importer but happens for pre-existing
        // rows), create one now and seed its quantity from newUnits.
        let componentId = row.component_id;
        if (!componentId) {
          componentId = `cmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          db.prepare(`
            INSERT INTO components (
              id, name, description, category, quantity, min_threshold,
              image_url, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            componentId,
            detail.productTitle,
            null,
            'Electronic Component',
            newUnits,
            0,
            detail.localImagePath || null,
            'available',
            now,
            now
          );
          db.prepare('UPDATE order_items SET component_id = ? WHERE id = ?').run(componentId, row.id);
          results.componentsRenamed++;
        } else {
          const current = db.prepare('SELECT name FROM components WHERE id = ?').get(componentId) as
            { name: string } | undefined;
          const nameChanged = !!current && current.name !== detail.productTitle;
          db.prepare(`
            UPDATE components
            SET name = ?,
                image_url = COALESCE(image_url, ?),
                quantity = quantity + ?,
                updated_at = ?
            WHERE id = ?
          `).run(
            detail.productTitle,
            detail.localImagePath || null,
            unitsDelta,
            now,
            componentId
          );
          if (nameChanged) results.componentsRenamed++;
        }
      }
      // Insert rows for any detail items left unmatched after both pairing
      // passes. Creates a new component for each and links it to the new
      // order_item — this covers the common case where the original My
      // Orders import collapsed a multi-variant order to fewer rows than
      // the detail page actually has.
      for (const detail of leftoverAfterOrphans) {
        const effectiveUnitCost = Math.round(detail.unitPrice * discountFactor * 10000) / 10000;
        const packSize = parsePackSize(detail.productTitle, detail.variation);
        const unitsInStock = (detail.quantity || 0) * packSize;

        const componentId = `cmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT INTO components (
            id, name, description, category, quantity, min_threshold,
            image_url, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          componentId,
          detail.productTitle,
          null,
          'Electronic Component',
          unitsInStock,
          0,
          detail.localImagePath || null,
          'available',
          now,
          now
        );

        const orderItemId = `oit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT INTO order_items (
            id, order_id, component_id, product_title, product_url,
            local_image_path, quantity, unit_cost, list_unit_cost, pack_size,
            variation, import_confidence, manual_review, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderItemId,
          order.id,
          componentId,
          detail.productTitle,
          detail.productUrl || null,
          detail.localImagePath || null,
          detail.quantity,
          effectiveUnitCost,
          detail.unitPrice,
          packSize,
          detail.variation || null,
          0.9,
          0,
          'Added from order-detail enrichment'
        );

        results.created++;
        results.orderItemIds.push(orderItemId);
        results.componentsRenamed++;
      }

      // Write the authoritative order-level cost (items + tax) and the
      // tax breakdown separately. sum(qty × unit_cost) equals itemsCost
      // = effectiveTotal − tax.
      if (effectiveTotal && effectiveTotal > 0) {
        db.prepare('UPDATE orders SET total_amount = ?, tax = ?, updated_at = ? WHERE id = ?').run(
          effectiveTotal,
          taxAmount,
          now,
          order.id
        );
      }
      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('enrich-order error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to enrich order',
    });
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(() => undefined);
    }
  }
});

/**
 * Enrich an existing Amazon-sourced order with an uploaded order detail
 * page. Mirrors the AliExpress enrich endpoint but uses the Amazon
 * parser's selectors. Matches items by ASIN (productId) and updates
 * product_title, quantity, unit_cost, pack_size, and the linked
 * component's name + image. Rejects with 409 when the detail page's
 * order number doesn't match the order being edited.
 */
router.post('/amazon/enrich-order/:orderId', (req, res, next) => {
  upload.single('detailFile')(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const { orderId } = req.params;
  let tempFilePath: string | null = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'detailFile is required' });
    }
    tempFilePath = req.file.path;
    const db = getDb(req);

    const order = db.prepare('SELECT id, order_number FROM orders WHERE id = ?').get(orderId) as
      { id: string; order_number: string | null } | undefined;
    if (!order) {
      return res.status(404).json({ error: `Order ${orderId} not found` });
    }

    const fileBuffer = await fs.readFile(tempFilePath);
    const parser = new AmazonHTMLParser('./uploads/imported-images');
    const {
      orderNumber: detailOrderNumber,
      items: detailItems,
      subtotal: detailSubtotal,
      total: rawDetailTotal,
      tax: detailTax,
    } = await parser.parseOrderDetail(fileBuffer);

    if (detailOrderNumber && order.order_number && detailOrderNumber !== order.order_number) {
      return res.status(409).json({
        error: `Uploaded detail page is for order ${detailOrderNumber}, but you are editing order ${order.order_number}.`,
      });
    }
    if (detailItems.length === 0) {
      return res.status(422).json({
        error: 'Could not extract any items from the uploaded Amazon detail page.',
      });
    }

    let detailTotal = rawDetailTotal;
    if (detailSubtotal && detailTotal && !detailTax && detailSubtotal < detailTotal) {
      detailTotal = detailSubtotal;
    }

    const taxAmount = detailTax ?? 0;
    const itemsCost = Math.max(0, (detailTotal ?? 0) - taxAmount) || detailTotal || 0;
    const effectiveTotal = itemsCost + taxAmount;
    const discountFactor = (
      detailSubtotal && itemsCost && detailSubtotal > 0 && itemsCost > 0 && itemsCost < detailSubtotal
    ) ? itemsCost / detailSubtotal : 1;

    // Match existing order_items by ASIN extracted from their product_url.
    // quantity + pack_size are pulled so enrichment can rebalance the
    // linked component's stock by the (new - old) units delta.
    const existingItems = db.prepare(`
      SELECT id, component_id, product_url, quantity, pack_size
      FROM order_items WHERE order_id = ?
    `).all(orderId) as Array<{
      id: string;
      component_id: string | null;
      product_url: string | null;
      quantity: number | null;
      pack_size: number | null;
    }>;
    const asinOf = (url: string | null) => {
      const m = (url || '').match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/);
      return m ? m[1] : null;
    };
    const byAsin = new Map<string, typeof existingItems[0]>();
    for (const it of existingItems) {
      const a = asinOf(it.product_url);
      if (a) byAsin.set(a, it);
    }

    const results = {
      detailItems: detailItems.length,
      matched: 0,
      updated: 0,
      componentsRenamed: 0,
      subtotal: detailSubtotal,
      total: detailTotal,
      tax: taxAmount,
      itemsCost,
      effectiveTotal,
      discountFactor,
      unmatched: [] as Array<{ productId: string; productTitle: string }>,
      orderItemIds: [] as string[],
    };

    db.exec('BEGIN TRANSACTION');
    try {
      const now = new Date().toISOString();
      for (const detail of detailItems) {
        const row = byAsin.get(detail.productId);
        if (!row) {
          results.unmatched.push({ productId: detail.productId, productTitle: detail.productTitle });
          continue;
        }
        results.matched++;
        const effectiveUnitCost = Math.round(detail.unitPrice * discountFactor * 10000) / 10000;
        const packSize = parsePackSize(detail.productTitle, detail.variation);
        const oldUnits = (Number(row.quantity) || 0) * (Number(row.pack_size) || 1);
        const newUnits = (Number(detail.quantity) || 0) * packSize;
        const unitsDelta = newUnits - oldUnits;

        db.prepare(`
          UPDATE order_items SET
            product_title = ?,
            quantity = ?,
            unit_cost = ?,
            list_unit_cost = ?,
            pack_size = ?,
            product_url = COALESCE(?, product_url),
            local_image_path = COALESCE(?, local_image_path),
            manual_review = 0
          WHERE id = ?
        `).run(
          detail.productTitle,
          detail.quantity,
          effectiveUnitCost,
          detail.unitPrice,
          packSize,
          detail.productUrl || null,
          detail.localImagePath || null,
          row.id
        );
        results.orderItemIds.push(row.id);
        results.updated++;

        if (row.component_id) {
          const current = db.prepare('SELECT name FROM components WHERE id = ?').get(row.component_id) as { name: string } | undefined;
          const nameChanged = !!current && current.name !== detail.productTitle;
          db.prepare(`
            UPDATE components SET
              name = ?,
              image_url = COALESCE(image_url, ?),
              quantity = quantity + ?,
              updated_at = ?
            WHERE id = ?
          `).run(detail.productTitle, detail.localImagePath || null, unitsDelta, now, row.component_id);
          if (nameChanged) results.componentsRenamed++;
        }
      }
      if (effectiveTotal && effectiveTotal > 0) {
        db.prepare('UPDATE orders SET total_amount = ?, tax = ?, updated_at = ? WHERE id = ?').run(
          effectiveTotal,
          taxAmount,
          now,
          order.id
        );
      }
      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('amazon enrich-order error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to enrich Amazon order',
    });
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(() => undefined);
    }
  }
});

/**
 * Create a brand-new order from an AliExpress order detail page. Used by
 * the "Add Order" flow as a shortcut to seed an order from a .webarchive /
 * .mhtml / .html instead of typing everything manually.
 *
 * - Requires the detail page to contain a parseable order number.
 * - Rejects with 409 if an order with the same order_number already exists
 *   (the caller should fall through to enrich-order in that case).
 * - Spreads discount + factors bonus back into cost identically to the
 *   enrich endpoint. sum(qty × unit_cost) equals orders.total_amount.
 */
router.post('/aliexpress/create-from-detail', (req, res, next) => {
  upload.single('detailFile')(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  let tempFilePath: string | null = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'detailFile is required' });
    }
    tempFilePath = req.file.path;
    const db = getDb(req);

    const fileBuffer = await fs.readFile(tempFilePath);
    const parser = new AliExpressHTMLParser('./uploads/imported-images');
    const {
      orderNumber,
      orderDate,
      sellerName,
      items: detailItems,
      subtotal: detailSubtotal,
      total: rawDetailTotal,
      bonus: detailBonus,
      tax: detailTax,
    } = await parser.parseOrderDetail(fileBuffer);

    // Same clamp as enrich-order: if Total > Subtotal with no tax row, the
    // breakdown wasn't expanded before saving. Pin Total to Subtotal so we
    // don't silently inflate item cost.
    let detailTotal = rawDetailTotal;
    if (detailSubtotal && detailTotal && !detailTax && detailSubtotal < detailTotal) {
      detailTotal = detailSubtotal;
    }

    if (!orderNumber) {
      return res.status(422).json({
        error: 'Could not find an order number on the uploaded page. Make sure it is the order detail page (click into an order from My Orders), not the My Orders list.',
      });
    }
    if (detailItems.length === 0) {
      return res.status(422).json({
        error: 'No items found on the uploaded detail page.',
      });
    }

    const existing = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(orderNumber) as
      { id: string } | undefined;
    if (existing) {
      return res.status(409).json({
        error: `Order ${orderNumber} already exists. Open it from the Orders list and use "Import detail page" to enrich it instead.`,
        existingOrderId: existing.id,
      });
    }

    const taxAmount = detailTax ?? 0;
    const itemsCost = Math.max(0, (detailTotal ?? 0) + (detailBonus ?? 0) - taxAmount) || detailTotal || detailSubtotal || 0;
    const effectiveTotal = itemsCost + taxAmount;
    const discountFactor = (
      detailSubtotal && itemsCost && detailSubtotal > 0 && itemsCost > 0 && itemsCost < detailSubtotal
    ) ? itemsCost / detailSubtotal : 1;

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const orderDateFinal = orderDate || new Date().toISOString();
    const supplier = sellerName || 'AliExpress';

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare(`
        INSERT INTO orders (
          id, order_date, supplier, order_number, supplier_order_id,
          notes, total_amount, tax, import_source, import_date,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        orderDateFinal,
        supplier,
        orderNumber,
        orderNumber,
        'Imported from AliExpress detail page',
        effectiveTotal,
        taxAmount,
        'aliexpress',
        now,
        'delivered',
        now,
        now
      );

      for (const detail of detailItems) {
        const effectiveUnitCost = Math.round(detail.unitPrice * discountFactor * 10000) / 10000;
        const packSize = parsePackSize(detail.productTitle, detail.variation);
        const unitsInStock = (detail.quantity || 0) * packSize;
        const componentId = `cmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT INTO components (
            id, name, description, category, quantity, min_threshold,
            image_url, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          componentId,
          detail.productTitle,
          null,
          'Electronic Component',
          unitsInStock,
          0,
          detail.localImagePath || null,
          'available',
          now,
          now
        );

        const orderItemId = `oit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT INTO order_items (
            id, order_id, component_id, product_title, product_url,
            local_image_path, quantity, unit_cost, list_unit_cost, pack_size,
            variation, import_confidence, manual_review, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderItemId,
          orderId,
          componentId,
          detail.productTitle,
          detail.productUrl || null,
          detail.localImagePath || null,
          detail.quantity,
          effectiveUnitCost,
          detail.unitPrice,
          packSize,
          detail.variation || null,
          0.9,
          0,
          'Imported from order detail page'
        );
      }

      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }

    const warnings: string[] = [];
    const gap = detailSubtotal && detailTotal ? detailSubtotal - detailTotal : 0;
    if (gap > 0.01 && !detailTax && !detailBonus) {
      warnings.push(
        `Subtotal ($${detailSubtotal!.toFixed(2)}) exceeds Total ($${detailTotal!.toFixed(2)}) by $${gap.toFixed(2)}, but no Store discount / Coin credit / Additional charges / Bonus rows were found on the page. Expand the "Total" section on AliExpress (click the arrow next to Total) before saving the webarchive so the breakdown renders in the DOM.`
      );
    }
    if (rawDetailTotal !== detailTotal) {
      warnings.push(
        `Total on the detail page ($${rawDetailTotal!.toFixed(2)}) exceeded Subtotal ($${detailSubtotal!.toFixed(2)}) with no tax row present — clamped Total to Subtotal to avoid silently inflating item cost. Re-save with the breakdown expanded to capture the actual tax.`
      );
    }

    res.status(201).json({
      success: true,
      orderId,
      orderNumber,
      orderDate: orderDateFinal,
      supplier,
      itemCount: detailItems.length,
      subtotal: detailSubtotal,
      total: detailTotal,
      bonus: detailBonus,
      tax: taxAmount,
      itemsCost,
      effectiveTotal,
      discountFactor,
      warnings,
    });
  } catch (error) {
    console.error('create-from-detail error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create order from detail page',
    });
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(() => undefined);
    }
  }
});

/**
 * Create a brand-new order from an Amazon order detail page. Structural
 * sibling of /aliexpress/create-from-detail — same cost decomposition
 * (items + tax = orders.total_amount, line totals sum to itemsCost),
 * same 409 behaviour when the order_number already exists.
 *
 * Amazon doesn't expose "Store discount" or "Coin credit" the way
 * AliExpress does, so the subtotal→total delta is usually just
 * shipping-and-handling + promo/coupon. We still run the same
 * discountFactor math so unit_cost ends up post-discount; any
 * shipping/handling fold into the item-level discount factor (acceptable
 * because Amazon shipping is tied to individual items).
 */
router.post('/amazon/create-from-detail', (req, res, next) => {
  upload.single('detailFile')(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  let tempFilePath: string | null = null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'detailFile is required' });
    }
    tempFilePath = req.file.path;
    const db = getDb(req);

    const fileBuffer = await fs.readFile(tempFilePath);
    const parser = new AmazonHTMLParser('./uploads/imported-images');
    const {
      orderNumber,
      orderDate,
      sellerName,
      items: detailItems,
      subtotal: detailSubtotal,
      total: rawDetailTotal,
      tax: detailTax,
    } = await parser.parseOrderDetail(fileBuffer);

    // Same clamp rule as AliExpress: if total > subtotal with no tax row,
    // the untagged overage is almost certainly tax — pin total to subtotal.
    let detailTotal = rawDetailTotal;
    if (detailSubtotal && detailTotal && !detailTax && detailSubtotal < detailTotal) {
      detailTotal = detailSubtotal;
    }

    if (!orderNumber) {
      return res.status(422).json({
        error: 'Could not find an Amazon order number (XXX-XXXXXXX-XXXXXXX) on the uploaded page. Make sure you saved the order DETAIL page from Your Orders.',
      });
    }
    if (detailItems.length === 0) {
      return res.status(422).json({
        error: 'No items found on the uploaded Amazon detail page.',
      });
    }

    const existing = db.prepare('SELECT id FROM orders WHERE order_number = ?').get(orderNumber) as
      { id: string } | undefined;
    if (existing) {
      return res.status(409).json({
        error: `Order ${orderNumber} already exists. Open it from the Orders list to edit.`,
        existingOrderId: existing.id,
      });
    }

    const taxAmount = detailTax ?? 0;
    const itemsCost = Math.max(0, (detailTotal ?? 0) - taxAmount) || detailTotal || detailSubtotal || 0;
    const effectiveTotal = itemsCost + taxAmount;
    const discountFactor = (
      detailSubtotal && itemsCost && detailSubtotal > 0 && itemsCost > 0 && itemsCost < detailSubtotal
    ) ? itemsCost / detailSubtotal : 1;

    const orderId = `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const orderDateFinal = orderDate || new Date().toISOString();
    const supplier = sellerName || 'Amazon';

    db.exec('BEGIN TRANSACTION');
    try {
      db.prepare(`
        INSERT INTO orders (
          id, order_date, supplier, order_number, supplier_order_id,
          notes, total_amount, tax, import_source, import_date,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        orderDateFinal,
        supplier,
        orderNumber,
        orderNumber,
        'Imported from Amazon order detail page',
        effectiveTotal,
        taxAmount,
        'amazon',
        now,
        'delivered',
        now,
        now
      );

      for (const detail of detailItems) {
        const effectiveUnitCost = Math.round(detail.unitPrice * discountFactor * 10000) / 10000;
        const packSize = parsePackSize(detail.productTitle, detail.variation);
        const unitsInStock = (detail.quantity || 0) * packSize;
        const componentId = `cmp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT INTO components (
            id, name, description, category, quantity, min_threshold,
            image_url, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          componentId,
          detail.productTitle,
          null,
          'Electronic Component',
          unitsInStock,
          0,
          detail.localImagePath || null,
          'available',
          now,
          now
        );

        const orderItemId = `oit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        db.prepare(`
          INSERT INTO order_items (
            id, order_id, component_id, product_title, product_url,
            local_image_path, quantity, unit_cost, list_unit_cost, pack_size,
            variation, import_confidence, manual_review, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          orderItemId,
          orderId,
          componentId,
          detail.productTitle,
          detail.productUrl || null,
          detail.localImagePath || null,
          detail.quantity,
          effectiveUnitCost,
          detail.unitPrice,
          packSize,
          detail.variation || null,
          0.9,
          0,
          'Imported from Amazon detail page'
        );
      }
      db.exec('COMMIT');
    } catch (dbErr) {
      db.exec('ROLLBACK');
      throw dbErr;
    }

    const warnings: string[] = [];
    if (rawDetailTotal !== detailTotal) {
      warnings.push(
        `Total ($${rawDetailTotal!.toFixed(2)}) exceeded Subtotal ($${detailSubtotal!.toFixed(2)}) with no tax row detected — clamped Total to Subtotal.`
      );
    }

    res.status(201).json({
      success: true,
      orderId,
      orderNumber,
      orderDate: orderDateFinal,
      supplier,
      itemCount: detailItems.length,
      subtotal: detailSubtotal,
      total: detailTotal,
      tax: taxAmount,
      itemsCost,
      effectiveTotal,
      discountFactor,
      warnings,
    });
  } catch (error) {
    console.error('amazon create-from-detail error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create order from Amazon detail page',
    });
  } finally {
    if (tempFilePath) {
      fs.unlink(tempFilePath).catch(() => undefined);
    }
  }
});

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

  // Inventory contribution for this line = order-line qty × pack size.
  // pack_size is supplied by the caller (parsed from title) and defaults
  // to 1 for legacy callers.
  const packSize = Number(item.packSize) || 1;
  const unitsDelta = (Number(item.quantity) || 0) * packSize;

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
      `).run(component.description, item.localImagePath, unitsDelta, now, componentId);
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
        unitsDelta,
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