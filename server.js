const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Kuunganisha Database ya Supabase
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Inaruhusu SSL ya Supabase kupita bila error
    }
});

// Jaribu Muunganisho wa Database
pool.connect((err, client, release) => {
    if (err) {
        return console.error('Error kuunganisha na Database:', err.stack);
    }
    console.log('✅ Wiggle Accounting imeunganishwa na Database ya Supabase kikamilifu!');
    release();
});

// ==========================================
// API ROUTES
// ==========================================

// 1. Kuchukua Orodha ya Bidhaa (Inventory)
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Kuongeza Bidhaa Mpya
app.post('/api/products', async (req, res) => {
    const { name, quantity, unit_price, min_stock_alert } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO products (name, quantity, unit_price, min_stock_alert) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, quantity, unit_price, min_stock_alert]
        );
        res.json({ message: "Bidhaa imeongezwa!", product: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Kurekodi Mauzo Mapya (Sales)
app.post('/api/sales', async (req, res) => {
    const { invoice_no, customer_id, total_amount, payment_status, payment_method } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO sales (invoice_no, customer_id, total_amount, payment_status, payment_method) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [invoice_no, customer_id, total_amount, payment_status, payment_method]
        );
        res.json({ message: "Mauzo yamekamilika!", sale: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Kurekodi Matumizi (Expenses)
app.post('/api/expenses', async (req, res) => {
    const { category, amount, paid_from, notes } = req.body;
    try {
        const result = await pool.query(
            'INSERT INTO expenses (category, amount, paid_from, notes) VALUES ($1, $2, $3, $4) RETURNING *',
            [category, amount, paid_from, notes]
        );
        res.json({ message: "Matumizi yamerekodiwa!", expense: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API ya kufuta takwimu zote mara moja
app.delete('/api/reset-dashboard', async (req, res) => {
    try {
      await supabase.from('sales').delete().neq('id', 0);
      await supabase.from('expenses').delete().neq('id', 0);
      res.json({ message: 'Dashboard imesafishwa kikamilifu!' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

// Washa Server
app.listen(PORT, () => {
    console.log(`🚀 Wiggle Accounting Backend inaendesha kwenye: http://localhost:${PORT}`);
});