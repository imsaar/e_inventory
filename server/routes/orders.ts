import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import Database from 'better-sqlite3';
import { validateSchema } from '../middleware/validation';
import defaultDb from '../database';

const router = express.Router();

// Get database instance - support dependency injection for testing
function getDb(req: express.Request) {
  return (req.app.get('db') as any) || defaultDb;
}

// Validation schemas
const orderSchema = z.object({
  orderDate: z.string(),
  supplier: z.string().optional(),
  orderNumber: z.string().optional(),
  notes: z.string().optional(),
  totalAmount: z.number().optional(),
  status: z.enum(['pending', 'ordered', 'shipped', 'delivered', 'cancelled']).default('delivered'),
  items: z.array(z.object({
    componentId: z.string(),
    quantity: z.number().min(1),
    unitCost: z.number().min(0),
    notes: z.string().optional()
  })).min(1)
});

const orderUpdateSchema = z.object({
  orderDate: z.string().optional(),
  supplier: z.string().optional(),
  orderNumber: z.string().optional(),
  notes: z.string().optional(),
  totalAmount: z.number().optional(),
  status: z.enum(['pending', 'ordered', 'shipped', 'delivered', 'cancelled']).optional()
});

const bulkDeleteSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(100) // Limit to 100 orders for safety
});

// Helper function to map database row to Order object
const mapOrderRow = (row: any) => ({
  id: row.id,
  orderDate: row.order_date,
  supplier: row.supplier,
  orderNumber: row.order_number,
  notes: row.notes,
  totalAmount: row.total_amount,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

// Helper function to map database row to OrderItem object
const mapOrderItemRow = (row: any) => ({
  id: row.id,
  orderId: row.order_id,
  componentId: row.component_id,
  quantity: row.quantity,
  unitCost: row.unit_cost,
  totalCost: row.total_cost,
  notes: row.notes
});

// GET /api/orders - List all orders with search/filter support
router.get('/', (req, res) => {
  try {
    const db = getDb(req);
    
    const { 
      term, 
      status, 
      supplier, 
      dateFrom, 
      dateTo, 
      minAmount, 
      maxAmount, 
      sortBy = 'order_date', 
      sortOrder = 'desc' 
    } = req.query;

    let query = `
      SELECT o.*, 
             COUNT(oi.id) as item_count,
             SUM(oi.total_cost) as calculated_total
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE 1=1
    `;
    
    const params: any[] = [];

    // Search term - search in order number, supplier, and notes
    if (term && typeof term === 'string') {
      query += ` AND (
        o.order_number LIKE ? OR 
        o.supplier LIKE ? OR 
        o.notes LIKE ?
      )`;
      const searchTerm = `%${term}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Status filter
    if (status && typeof status === 'string') {
      query += ` AND o.status = ?`;
      params.push(status);
    }

    // Supplier filter
    if (supplier && typeof supplier === 'string') {
      query += ` AND o.supplier = ?`;
      params.push(supplier);
    }

    // Date range filters
    if (dateFrom && typeof dateFrom === 'string') {
      query += ` AND o.order_date >= ?`;
      params.push(dateFrom);
    }
    if (dateTo && typeof dateTo === 'string') {
      query += ` AND o.order_date <= ?`;
      params.push(dateTo);
    }

    // Group by for aggregations
    query += ` GROUP BY o.id`;

    // Amount filters (applied after aggregation)
    const havingConditions = [];
    if (minAmount && typeof minAmount === 'string') {
      havingConditions.push(`(o.total_amount >= ? OR SUM(oi.total_cost) >= ?)`);
      const minVal = parseFloat(minAmount);
      params.push(minVal, minVal);
    }
    if (maxAmount && typeof maxAmount === 'string') {
      havingConditions.push(`(o.total_amount <= ? OR SUM(oi.total_cost) <= ?)`);
      const maxVal = parseFloat(maxAmount);
      params.push(maxVal, maxVal);
    }
    if (havingConditions.length > 0) {
      query += ` HAVING ${havingConditions.join(' AND ')}`;
    }

    // Sorting
    const allowedSortColumns = {
      'orderDate': 'o.order_date',
      'orderNumber': 'o.order_number',
      'supplier': 'o.supplier',
      'totalAmount': 'COALESCE(o.total_amount, SUM(oi.total_cost))',
      'status': 'o.status'
    };
    
    const sortColumn = allowedSortColumns[sortBy as keyof typeof allowedSortColumns] || 'o.order_date';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY ${sortColumn} ${sortDirection}, o.created_at DESC`;

    const orders = db.prepare(query).all(...params);

    const mappedOrders = orders.map((row: any) => {
      // Get a sample of items for this order (up to 3 items)
      const orderItems = db.prepare(`
        SELECT oi.quantity, c.name as component_name, c.image_url as component_image
        FROM order_items oi
        LEFT JOIN components c ON oi.component_id = c.id
        WHERE oi.order_id = ?
        ORDER BY c.name
        LIMIT 3
      `).all(row.id);
      
      return {
        ...mapOrderRow(row),
        itemCount: row.item_count,
        calculatedTotal: row.calculated_total,
        itemsSummary: orderItems.map((item: any) => ({
          name: item.component_name || 'Unknown Component',
          quantity: item.quantity,
          image: item.component_image
        }))
      };
    });

    res.json(mappedOrders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id - Get specific order with items
router.get('/:id', (req, res) => {
  try {
    const db = getDb(req);
    const { id } = req.params;

    const order = db.prepare(`
      SELECT * FROM orders WHERE id = ?
    `).get(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = db.prepare(`
      SELECT oi.*, c.name as component_name, c.part_number
      FROM order_items oi
      LEFT JOIN components c ON oi.component_id = c.id
      WHERE oi.order_id = ?
      ORDER BY c.name
    `).all(id);

    const mappedOrder = {
      ...mapOrderRow(order),
      items: items.map((item: any) => ({
        ...mapOrderItemRow(item),
        componentName: item.component_name,
        componentPartNumber: item.part_number
      }))
    };

    res.json(mappedOrder);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// POST /api/orders - Create new order
router.post('/', validateSchema(orderSchema), (req, res) => {
  const db = getDb(req);
  const transaction = db.transaction(() => {
    try {
      const { items, ...orderData } = req.body;
      const orderId = uuidv4();

      // Create order
      const orderStmt = db.prepare(`
        INSERT INTO orders (id, order_date, supplier, order_number, notes, total_amount, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      orderStmt.run(
        orderId,
        orderData.orderDate,
        orderData.supplier,
        orderData.orderNumber,
        orderData.notes,
        orderData.totalAmount,
        orderData.status || 'delivered'
      );

      // Create order items and update component quantities
      const itemStmt = db.prepare(`
        INSERT INTO order_items (id, order_id, component_id, quantity, unit_cost, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const updateQuantityStmt = db.prepare(`
        UPDATE components 
        SET quantity = quantity + ?, 
            updated_at = datetime('now')
        WHERE id = ?
      `);

      for (const item of items) {
        // Create order item
        itemStmt.run(
          uuidv4(),
          orderId,
          item.componentId,
          item.quantity,
          item.unitCost,
          item.notes
        );

        // Update component quantity (add to inventory)
        updateQuantityStmt.run(item.quantity, item.componentId);
      }

      // Fetch the created order with items
      const createdOrder = db.prepare(`
        SELECT * FROM orders WHERE id = ?
      `).get(orderId);

      const orderItems = db.prepare(`
        SELECT oi.*, c.name as component_name, c.part_number
        FROM order_items oi
        LEFT JOIN components c ON oi.component_id = c.id
        WHERE oi.order_id = ?
      `).all(orderId);

      const result = {
        ...mapOrderRow(createdOrder),
        items: orderItems.map((item: any) => ({
          ...mapOrderItemRow(item),
          componentName: item.component_name,
          componentPartNumber: item.part_number
        }))
      };

      res.status(201).json(result);
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  });

  try {
    transaction();
  } catch (error) {
    console.error('Transaction failed:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PUT /api/orders/:id - Update order (not items)
router.put('/:id', validateSchema(orderUpdateSchema), (req, res) => {
  try {
    const db = getDb(req);
    const { id } = req.params;
    const updateData = req.body;

    const updateStmt = db.prepare(`
      UPDATE orders SET
        order_date = COALESCE(?, order_date),
        supplier = COALESCE(?, supplier),
        order_number = COALESCE(?, order_number),
        notes = COALESCE(?, notes),
        total_amount = COALESCE(?, total_amount),
        status = COALESCE(?, status),
        updated_at = datetime('now')
      WHERE id = ?
    `);

    const result = updateStmt.run(
      updateData.orderDate,
      updateData.supplier,
      updateData.orderNumber,
      updateData.notes,
      updateData.totalAmount,
      updateData.status,
      id
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch updated order
    const updatedOrder = db.prepare(`
      SELECT * FROM orders WHERE id = ?
    `).get(id);

    res.json(mapOrderRow(updatedOrder));
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// DELETE /api/orders/:id - Delete order and items
router.delete('/:id', (req, res) => {
  const db = getDb(req);
  const transaction = db.transaction(() => {
    try {
      const { id } = req.params;

      // Get order items to reverse quantity changes
      const items = db.prepare(`
        SELECT component_id, quantity FROM order_items WHERE order_id = ?
      `).all(id) as any[];

      // Reverse component quantities
      const updateQuantityStmt = db.prepare(`
        UPDATE components 
        SET quantity = quantity - ?, 
            updated_at = datetime('now')
        WHERE id = ?
      `);

      for (const item of items) {
        updateQuantityStmt.run(item.quantity, item.component_id);
      }

      // Delete order (items will be deleted by CASCADE)
      const deleteStmt = db.prepare(`DELETE FROM orders WHERE id = ?`);
      const result = deleteStmt.run(id);

      if (result.changes === 0) {
        throw new Error('Order not found');
      }

      return result.changes;
    } catch (error) {
      console.error('Error deleting order:', error);
      throw error;
    }
  });

  try {
    const changes = transaction();
    res.json({ success: true, deleted: changes });
  } catch (error: any) {
    if (error.message === 'Order not found') {
      res.status(404).json({ error: 'Order not found' });
    } else {
      res.status(500).json({ error: 'Failed to delete order' });
    }
  }
});

// POST /api/orders/bulk-delete - Delete multiple orders
router.post('/bulk-delete', validateSchema(bulkDeleteSchema), (req, res) => {
  const db = getDb(req);
  const transaction = db.transaction(() => {
    try {
      const { orderIds } = req.body;
      const results = {
        deleted: 0,
        errors: [] as string[]
      };

      // First, get all order items for quantity reversal
      const placeholders = orderIds.map(() => '?').join(',');
      const allItems = db.prepare(`
        SELECT oi.order_id, oi.component_id, oi.quantity, o.order_number
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE oi.order_id IN (${placeholders})
      `).all(...orderIds) as any[];

      // Group items by order for better error handling
      const itemsByOrder = new Map<string, any[]>();
      allItems.forEach(item => {
        if (!itemsByOrder.has(item.order_id)) {
          itemsByOrder.set(item.order_id, []);
        }
        itemsByOrder.get(item.order_id)!.push(item);
      });

      const updateQuantityStmt = db.prepare(`
        UPDATE components 
        SET quantity = quantity - ?, 
            updated_at = datetime('now')
        WHERE id = ?
      `);

      const deleteOrderStmt = db.prepare(`DELETE FROM orders WHERE id = ?`);

      // Process each order
      for (const orderId of orderIds) {
        try {
          const orderItems = itemsByOrder.get(orderId) || [];
          const orderNumber = orderItems[0]?.order_number || orderId;

          // Reverse component quantities for this order
          for (const item of orderItems) {
            updateQuantityStmt.run(item.quantity, item.component_id);
          }

          // Delete the order (items will be deleted by CASCADE)
          const result = deleteOrderStmt.run(orderId);

          if (result.changes > 0) {
            results.deleted++;
          } else {
            results.errors.push(`Order ${orderNumber} not found`);
          }
        } catch (error: any) {
          const orderNumber = itemsByOrder.get(orderId)?.[0]?.order_number || orderId;
          results.errors.push(`Failed to delete order ${orderNumber}: ${error.message}`);
        }
      }

      return results;
    } catch (error) {
      console.error('Error in bulk delete transaction:', error);
      throw error;
    }
  });

  try {
    const results = transaction();
    
    if (results.deleted === 0 && results.errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No orders were deleted',
        results 
      });
    }

    res.json({
      success: true,
      message: `Successfully deleted ${results.deleted} order(s)`,
      results
    });
  } catch (error: any) {
    console.error('Bulk delete transaction failed:', error);
    res.status(500).json({ 
      error: 'Bulk delete operation failed',
      details: error.message 
    });
  }
});

export default router;