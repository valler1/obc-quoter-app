const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Automatically create tables if they don't exist
const initSchema = async () => {
  const schemaSql = `
  CREATE TABLE IF NOT EXISTS quotes (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    customer_name TEXT NOT NULL,
    customer_company TEXT,
    customer_contact TEXT,
    origin_city TEXT NOT NULL,
    destination_city TEXT NOT NULL,
    pickup_time TIMESTAMP,
    delivery_deadline TIMESTAMP,
    package_description TEXT,
    weight_kg NUMERIC,
    traveler TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    flight_cost_total NUMERIC DEFAULT 0,
    ground_cost_total NUMERIC DEFAULT 0,
    time_cost_total NUMERIC DEFAULT 0,
    other_cost_total NUMERIC DEFAULT 0,
    total_cost NUMERIC DEFAULT 0,
    margin_type TEXT,
    margin_value NUMERIC,
    margin_amount NUMERIC DEFAULT 0,
    price_to_customer NUMERIC DEFAULT 0,
    currency TEXT DEFAULT 'EUR',
    internal_note TEXT
  );

  CREATE TABLE IF NOT EXISTS cost_items (
    id SERIAL PRIMARY KEY,
    quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC,
    unit TEXT,
    unit_price NUMERIC,
    line_total NUMERIC,
    category TEXT
  );

  CREATE TABLE IF NOT EXISTS flight_segments (
    id SERIAL PRIMARY KEY,
    quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE,
    from_iata TEXT,
    to_iata TEXT,
    departure TIMESTAMP,
    arrival TIMESTAMP,
    carrier_code TEXT,
    flight_number TEXT,
    price_component NUMERIC
  );
  `;

  try {
    await pool.query(schemaSql);
    console.log('Database schema ensured');
  } catch (err) {
    console.error('Error initializing schema:', err);
  }
};

initSchema();

module.exports = {
  query: (text, params) => pool.query(text, params),
};
