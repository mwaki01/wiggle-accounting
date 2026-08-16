const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connection ya PostgreSQL Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Create Tables (kama hazijaundwa)
const initDb = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      quantity INT NOT NULL DEFAULT 0,
      unit_price NUMERIC(10,2) NOT NULL,
      min_stock_alert INT DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS sales (
      id SERIAL PRIMARY KEY,
      invoice_no VARCHAR(50),
      total_amount NUMERIC(10,2) NOT NULL,
      payment_status VARCHAR(20) DEFAULT 'Paid',
      payment_method VARCHAR(20) DEFAULT 'Cash',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      category VARCHAR(50) NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      paid_from VARCHAR(20) DEFAULT 'Cash',
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
};
initDb().catch(console.error);

// ---------------- PRODUCTS / INVENTORY ROUTES ----------------
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, quantity, unit_price, min_stock_alert } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO products (name, quantity, unit_price, min_stock_alert) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, quantity, unit_price, min_stock_alert || 5]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products/:id/purchase', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const { rows } = await pool.query(
      'UPDATE products SET quantity = quantity + $1 WHERE id = $2 RETURNING *',
      [quantity, id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/products/:id/stockout', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    const { rows } = await pool.query(
      'UPDATE products SET quantity = GREATEST(0, quantity - $1) WHERE id = $2 RETURNING *',
      [quantity, id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------- SALES & EXPENSES ROUTES ----------------
app.get('/api/sales', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sales ORDER BY id DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/sales', async (req, res) => {
  try {
    const { invoice_no, total_amount, payment_status, payment_method } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO sales (invoice_no, total_amount, payment_status, payment_method) VALUES ($1, $2, $3, $4) RETURNING *',
      [invoice_no, total_amount, payment_status, payment_method]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/expenses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM expenses ORDER BY id DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', async (req, res) => {
  try {
    const { category, amount, paid_from, notes } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO expenses (category, amount, paid_from, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      [category, amount, paid_from, notes]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------- BALANCE SHEET API ----------------
app.get('/api/reports/balance-sheet', async (req, res) => {
  try {
    const { rows: products } = await pool.query('SELECT quantity, unit_price FROM products');
    const inventoryValue = products.reduce((sum, p) => sum + (Number(p.quantity) * Number(p.unit_price)), 0);

    const { rows: sales } = await pool.query('SELECT total_amount, payment_status, payment_method FROM sales');
    let cashOnHand = 0, bankBalance = 0, accountsReceivable = 0;

    sales.forEach(s => {
      const amt = Number(s.total_amount);
      if (s.payment_status === 'Paid') {
        if (s.payment_method === 'Bank') bankBalance += amt;
        else cashOnHand += amt;
      } else accountsReceivable += amt;
    });

    const { rows: expenses } = await pool.query('SELECT amount, paid_from FROM expenses');
    expenses.forEach(e => {
      const amt = Number(e.amount);
      if (e.paid_from === 'Bank') bankBalance -= amt;
      else cashOnHand -= amt;
    });

    const totalAssets = cashOnHand + bankBalance + inventoryValue + accountsReceivable;
    const totalLiabilities = 0;
    const capital = totalAssets - totalLiabilities;

    res.json({
      assets: { cash: cashOnHand, bank: bankBalance, inventory: inventoryValue, receivables: accountsReceivable, totalAssets },
      liabilities: { payables: totalLiabilities, totalLiabilities },
      equity: { capital, totalEquity: capital }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));