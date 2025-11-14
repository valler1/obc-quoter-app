const express = require('express');
const router = express.Router();
const db = require('../db');

// get all quotes (simple list)
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, created_at, customer_name, customer_company, origin_city, destination_city, price_to_customer, status FROM quotes ORDER BY created_at DESC LIMIT 100'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get quotes error:', err);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

// get single quote
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const quoteRes = await db.query(
      'SELECT * FROM quotes WHERE id = $1',
      [id]
    );
    if (quoteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const costItemsRes = await db.query(
      'SELECT * FROM cost_items WHERE quote_id = $1 ORDER BY id',
      [id]
    );
    const flightsRes = await db.query(
      'SELECT * FROM flight_segments WHERE quote_id = $1 ORDER BY id',
      [id]
    );

    res.json({
      quote: quoteRes.rows[0],
      costItems: costItemsRes.rows,
      flightSegments: flightsRes.rows
    });
  } catch (err) {
    console.error('Get quote error:', err);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// create or update quote
router.post('/', async (req, res) => {
  const {
    id,
    customer_name,
    customer_company,
    customer_contact,
    origin_city,
    destination_city,
    pickup_time,
    delivery_deadline,
    package_description,
    weight_kg,
    traveler,
    status,
    flight_cost_total,
    ground_cost_total,
    time_cost_total,
    other_cost_total,
    total_cost,
    margin_type,
    margin_value,
    margin_amount,
    price_to_customer,
    currency,
    internal_note,
    flight_segments,
    cost_items
  } = req.body;

  const client = await db.query('BEGIN').catch(e => null);
  if (!client) {
    // using pool directly for simplicity; no transactions across multiple queries
  }

  try {
    let quoteId = id;

    if (!quoteId) {
      const insertRes = await db.query(
        `INSERT INTO quotes (
          customer_name, customer_company, customer_contact,
          origin_city, destination_city,
          pickup_time, delivery_deadline,
          package_description, weight_kg, traveler,
          status,
          flight_cost_total, ground_cost_total, time_cost_total, other_cost_total,
          total_cost,
          margin_type, margin_value, margin_amount,
          price_to_customer, currency,
          internal_note
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
        ) RETURNING id`,
        [
          customer_name,
          customer_company,
          customer_contact,
          origin_city,
          destination_city,
          pickup_time,
          delivery_deadline,
          package_description,
          weight_kg,
          traveler,
          status || 'draft',
          flight_cost_total || 0,
          ground_cost_total || 0,
          time_cost_total || 0,
          other_cost_total || 0,
          total_cost || 0,
          margin_type,
          margin_value,
          margin_amount || 0,
          price_to_customer || 0,
          currency || 'EUR',
          internal_note || ''
        ]
      );
      quoteId = insertRes.rows[0].id;
    } else {
      await db.query(
        `UPDATE quotes SET
          customer_name = $1,
          customer_company = $2,
          customer_contact = $3,
          origin_city = $4,
          destination_city = $5,
          pickup_time = $6,
          delivery_deadline = $7,
          package_description = $8,
          weight_kg = $9,
          traveler = $10,
          status = $11,
          flight_cost_total = $12,
          ground_cost_total = $13,
          time_cost_total = $14,
          other_cost_total = $15,
          total_cost = $16,
          margin_type = $17,
          margin_value = $18,
          margin_amount = $19,
          price_to_customer = $20,
          currency = $21,
          internal_note = $22
        WHERE id = $23`,
        [
          customer_name,
          customer_company,
          customer_contact,
          origin_city,
          destination_city,
          pickup_time,
          delivery_deadline,
          package_description,
          weight_kg,
          traveler,
          status || 'draft',
          flight_cost_total || 0,
          ground_cost_total || 0,
          time_cost_total || 0,
          other_cost_total || 0,
          total_cost || 0,
          margin_type,
          margin_value,
          margin_amount || 0,
          price_to_customer || 0,
          currency || 'EUR',
          internal_note || '',
          quoteId
        ]
      );
      await db.query('DELETE FROM cost_items WHERE quote_id = $1', [quoteId]);
      await db.query('DELETE FROM flight_segments WHERE quote_id = $1', [quoteId]);
    }

    if (Array.isArray(cost_items)) {
      for (const item of cost_items) {
        await db.query(
          `INSERT INTO cost_items
           (quote_id, description, quantity, unit, unit_price, line_total, category)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            quoteId,
            item.description,
            item.quantity,
            item.unit,
            item.unit_price,
            item.line_total,
            item.category || null
          ]
        );
      }
    }

    if (Array.isArray(flight_segments)) {
      for (const seg of flight_segments) {
        await db.query(
          `INSERT INTO flight_segments
           (quote_id, from_iata, to_iata, departure, arrival,
            carrier_code, flight_number, price_component)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            quoteId,
            seg.from,
            seg.to,
            seg.departure,
            seg.arrival,
            seg.carrierCode,
            seg.flightNumber,
            seg.price_component || null
          ]
        );
      }
    }

    res.json({ id: quoteId });
  } catch (err) {
    console.error('Create/update quote error:', err);
    res.status(500).json({ error: 'Failed to save quote' });
  }
});

module.exports = router;
