const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serving static files kutoka root directory
app.use(express.static(path.join(__dirname)));

// Connection ya PostgreSQL Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('PostgreSQL Connection Error:', err.message);
});

// Kutengeneza Tables (Kama hazijaundwa)
const initDb = async () => {
  if (!process.env.DATABASE_URL) return;
  try {
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
        item_name VARCHAR(100),
        quantity INT DEFAULT 1,
        unit_price NUMERIC(10,2) DEFAULT 0,
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

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        outstanding_balance NUMERIC(10,2) DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        balance_due NUMERIC(10,2) DEFAULT 0
      );
    `);
  } catch (err) {
    console.error("Db Init Error:", err.message);
  }
};
initDb();

// Home route - Inafungua index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------- PRODUCTS / INVENTORY ----------------
app.get('/api/products', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY id ASC');
    res.json(rows);
  } catch (err) { res.status(500).json([]); }
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

// ---------------- SALES ----------------
app.get('/api/sales', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM sales ORDER BY id DESC');
    res.json(rows);
  } catch (err) { res.status(500).json([]); }
});

app.post('/api/sales', async (req, res) => {
  try {
    const { item_name, quantity, unit_price, payment_status, payment_method } = req.body;
    const qty = Number(quantity) || 1;
    const price = Number(unit_price) || 0;
    const total_amount = qty * price;

    const { rows } = await pool.query(
      'INSERT INTO sales (item_name, quantity, unit_price, total_amount, payment_status, payment_method) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [item_name || 'Bidhaa', qty, price, total_amount, payment_status || 'Paid', payment_method || 'Cash']
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/sales/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM sales WHERE id = $1', [req.params.id]);
    res.json({ message: "Sales record deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---------------- EXPENSES ----------------
app.get('/api/expenses', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM expenses ORDER BY id DESC');
    res.json(rows);
  } catch (err) { res.status(500).json([]); }
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

// ---------------- CUSTOMERS & SUPPLIERS ----------------
app.get('/api/customers', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers ORDER BY id ASC');
    res.json(rows);
  } catch (err) { res.status(500).json([]); }
});

app.get('/api/suppliers', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY id ASC');
    res.json(rows);
  } catch (err) { res.status(500).json([]); }
});

// ---------------- REPORTS ----------------
app.get('/api/reports/profit-loss', async (req, res) => {
  try {
    const { rows: salesRows } = await pool.query('SELECT total_amount FROM sales');
    const { rows: expRows } = await pool.query('SELECT amount FROM expenses');

    const totalSales = salesRows.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);
    const totalExpenses = expRows.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    res.json({ totalSales, totalExpenses, netProfit: totalSales - totalExpenses });
  } catch (err) { res.status(500).json({ totalSales: 0, totalExpenses: 0, netProfit: 0 }); }
});

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

// Fallback Route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));