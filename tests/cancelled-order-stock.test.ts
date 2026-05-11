import { describe, test, expect, beforeEach } from '@jest/globals';
const request = require('supertest');
import app from '../server/index';

// Tests for the rule: cancelled and returned orders never contribute to
// component stock. Lives at the boundary between server/routes/orders.ts
// (POST/PUT/DELETE) and server/routes/components.ts
// (POST /recalculate-quantities reconciliation).
describe('Cancelled / returned orders + component stock', () => {
  let componentId: string;
  let locationId: string;

  async function cleanup() {
    const orders = await request(app).get('/api/orders');
    for (const order of orders.body) {
      if (order.orderNumber?.includes('CANCEL-TEST')) {
        await request(app).delete(`/api/orders/${order.id}`);
      }
    }
    const components = await request(app).get('/api/components');
    for (const c of components.body) {
      if (c.name?.startsWith('Cancel Stock Test')) {
        await request(app).delete(`/api/components/${c.id}`);
      }
    }
    const locations = await request(app).get('/api/locations');
    for (const l of locations.body) {
      if (l.name === 'Cancel Stock Test Box') {
        await request(app).delete(`/api/locations/${l.id}`);
      }
    }
  }

  beforeEach(async () => {
    await cleanup();
    const locRes = await request(app)
      .post('/api/locations')
      .send({ name: 'Cancel Stock Test Box', type: 'box' });
    locationId = locRes.body.id;

    const compRes = await request(app)
      .post('/api/components')
      .send({
        name: 'Cancel Stock Test Resistor',
        category: 'electronic',
        subcategory: 'resistor',
        partNumber: 'CST-001',
        quantity: 100,
        minThreshold: 0,
        unitCost: 0.10,
        locationId,
        tags: ['test'],
      })
      .expect(201);
    componentId = compRes.body.id;
  });

  test('POST /api/orders with status=cancelled does NOT increment component quantity', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        orderDate: '2026-04-01',
        supplier: 'CancelCo',
        orderNumber: 'CANCEL-TEST-1',
        totalAmount: 5,
        status: 'cancelled',
        items: [{ componentId, quantity: 25, unitCost: 0.20 }],
      })
      .expect(201);
    expect(res.body.status).toBe('cancelled');

    const compRes = await request(app).get(`/api/components/${componentId}`);
    // Started at 100, cancelled order should leave it untouched.
    expect(compRes.body.quantity).toBe(100);
  });

  test('POST /api/orders with status=returned does NOT increment component quantity', async () => {
    await request(app)
      .post('/api/orders')
      .send({
        orderDate: '2026-04-01',
        supplier: 'ReturnCo',
        orderNumber: 'CANCEL-TEST-2',
        totalAmount: 5,
        status: 'returned',
        items: [{ componentId, quantity: 7, unitCost: 0.20 }],
      })
      .expect(201);

    const compRes = await request(app).get(`/api/components/${componentId}`);
    expect(compRes.body.quantity).toBe(100);
  });

  test('PUT delivered → cancelled removes the order contribution from stock', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        orderDate: '2026-04-01',
        supplier: 'FlipCo',
        orderNumber: 'CANCEL-TEST-3',
        totalAmount: 4,
        status: 'delivered',
        items: [{ componentId, quantity: 20, unitCost: 0.20 }],
      })
      .expect(201);
    const orderId = orderRes.body.id;

    let comp = await request(app).get(`/api/components/${componentId}`);
    expect(comp.body.quantity).toBe(120);

    await request(app)
      .put(`/api/orders/${orderId}`)
      .send({ status: 'cancelled' })
      .expect(200);

    comp = await request(app).get(`/api/components/${componentId}`);
    expect(comp.body.quantity).toBe(100);

    // Flipping back restores the contribution (reflects PUT round-trip).
    await request(app)
      .put(`/api/orders/${orderId}`)
      .send({ status: 'delivered' })
      .expect(200);

    comp = await request(app).get(`/api/components/${componentId}`);
    expect(comp.body.quantity).toBe(120);
  });

  test('DELETE on a cancelled order does NOT decrement component quantity', async () => {
    const orderRes = await request(app)
      .post('/api/orders')
      .send({
        orderDate: '2026-04-01',
        supplier: 'DelCo',
        orderNumber: 'CANCEL-TEST-4',
        totalAmount: 4,
        status: 'cancelled',
        items: [{ componentId, quantity: 15, unitCost: 0.20 }],
      })
      .expect(201);

    // Cancelled order added nothing.
    let comp = await request(app).get(`/api/components/${componentId}`);
    expect(comp.body.quantity).toBe(100);

    await request(app).delete(`/api/orders/${orderRes.body.id}`).expect(200);

    // Deleting it must not subtract a contribution that was never there.
    comp = await request(app).get(`/api/components/${componentId}`);
    expect(comp.body.quantity).toBe(100);
  });

  describe('POST /api/components/recalculate-quantities', () => {
    test('returns dryRun diff without writing when ?dryRun=true', async () => {
      // Create a delivered order for 30 then manually inflate the stored
      // quantity to mimic legacy drift (e.g. cancelled-order seeding bug).
      await request(app)
        .post('/api/orders')
        .send({
          orderDate: '2026-04-01',
          supplier: 'ReconCo',
          orderNumber: 'CANCEL-TEST-5',
          totalAmount: 6,
          status: 'delivered',
          items: [{ componentId, quantity: 30, unitCost: 0.20 }],
        })
        .expect(201);

      // Hand-inflate to 999.
      await request(app)
        .put(`/api/components/${componentId}`)
        .send({ quantity: 999 })
        .expect(200);

      const dry = await request(app)
        .post('/api/components/recalculate-quantities?dryRun=true')
        .expect(200);
      expect(dry.body.dryRun).toBe(true);
      expect(dry.body.changed).toBeGreaterThanOrEqual(1);
      const ours = dry.body.components.find((c: any) => c.id === componentId);
      expect(ours).toBeDefined();
      expect(ours.oldQuantity).toBe(999);
      // Expected = 30 (the one delivered order). Initial 100 was the
      // user-set quantity, not from an order, so it doesn't count.
      expect(ours.newQuantity).toBe(30);

      // Nothing should have been written.
      const comp = await request(app).get(`/api/components/${componentId}`);
      expect(comp.body.quantity).toBe(999);
    });

    test('apply heals quantity inflated by a cancelled order', async () => {
      // Delivered order for 10.
      const delivered = await request(app)
        .post('/api/orders')
        .send({
          orderDate: '2026-04-01',
          supplier: 'OkCo',
          orderNumber: 'CANCEL-TEST-6',
          totalAmount: 2,
          status: 'delivered',
          items: [{ componentId, quantity: 10, unitCost: 0.20 }],
        })
        .expect(201);
      void delivered;

      // Cancelled order for 50, but pretend the legacy bug inflated stock:
      // bypass the POST guard by inserting via PUT after the fact.
      const buggy = await request(app)
        .post('/api/orders')
        .send({
          orderDate: '2026-04-02',
          supplier: 'BadCo',
          orderNumber: 'CANCEL-TEST-7',
          totalAmount: 10,
          status: 'delivered',
          items: [{ componentId, quantity: 50, unitCost: 0.20 }],
        })
        .expect(201);

      // Stock now: 100 (initial) + 10 + 50 = 160.
      let comp = await request(app).get(`/api/components/${componentId}`);
      expect(comp.body.quantity).toBe(160);

      // Manually inflate further to simulate "stuck" state, then mark order
      // cancelled while bypassing PUT's stock adjustment by directly updating
      // via a second POST sequence isn't possible here — instead use PUT
      // to flip status, which subtracts 50 (correct rule). Then bump
      // quantity back up by 50 manually to mimic the legacy drift that the
      // reconciliation endpoint is meant to heal.
      await request(app)
        .put(`/api/orders/${buggy.body.id}`)
        .send({ status: 'cancelled' })
        .expect(200);
      // After PUT: 160 - 50 = 110.
      comp = await request(app).get(`/api/components/${componentId}`);
      expect(comp.body.quantity).toBe(110);

      await request(app)
        .put(`/api/components/${componentId}`)
        .send({ quantity: 160 })
        .expect(200);

      // Reconcile.
      const apply = await request(app)
        .post('/api/components/recalculate-quantities')
        .expect(200);
      expect(apply.body.dryRun).toBe(false);
      const ours = apply.body.components.find((c: any) => c.id === componentId);
      expect(ours).toBeDefined();
      expect(ours.oldQuantity).toBe(160);
      // Only the delivered order (qty 10) counts now — cancelled is excluded.
      expect(ours.newQuantity).toBe(10);

      comp = await request(app).get(`/api/components/${componentId}`);
      expect(comp.body.quantity).toBe(10);
    });

    test('idempotent: a second run reports zero changes', async () => {
      await request(app)
        .post('/api/orders')
        .send({
          orderDate: '2026-04-01',
          supplier: 'IdemCo',
          orderNumber: 'CANCEL-TEST-8',
          totalAmount: 4,
          status: 'delivered',
          items: [{ componentId, quantity: 5, unitCost: 0.20 }],
        })
        .expect(201);

      // First run normalizes stock to the order-line sum (5).
      await request(app).post('/api/components/recalculate-quantities').expect(200);
      const second = await request(app)
        .post('/api/components/recalculate-quantities')
        .expect(200);
      expect(second.body.changed).toBe(0);
      expect(second.body.components).toEqual([]);
    });
  });
});
