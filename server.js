const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

pool.on("error", err => {
  console.error("PostgreSQL error:", err.message);
});

async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("DATABASE_URL haijawekwa.");
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        min_stock_alert INT DEFAULT 5
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        outstanding_balance NUMERIC(12,2) DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        balance_due NUMERIC(12,2) DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        item_name VARCHAR(100) NOT NULL,
        quantity INT NOT NULL,
        unit_price NUMERIC(12,2) NOT NULL,
        total_amount NUMERIC(12,2) NOT NULL,
        payment_status VARCHAR(20) DEFAULT 'Paid',
        customer_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category VARCHAR(100) NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        paid_from VARCHAR(30) DEFAULT 'Cash',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        product_id INT REFERENCES products(id) ON DELETE SET NULL,
        quantity INT NOT NULL,
        unit_cost NUMERIC(12,2) DEFAULT 0,
        total_cost NUMERIC(12,2) DEFAULT 0,
        supplier_name VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err.message);
  }
}

/* PRODUCTS */

app.get("/api/products", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM products ORDER BY id ASC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const { name, quantity, unit_price, min_stock_alert } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Jina la bidhaa linahitajika" });
    }

    const result = await pool.query(
      `INSERT INTO products
       (name, quantity, unit_price, min_stock_alert)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        name.trim(),
        Number(quantity) || 0,
        Number(unit_price) || 0,
        Number(min_stock_alert) || 5
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const { quantity, unit_price } = req.body;

    const result = await pool.query(
      `UPDATE products
       SET quantity = $1, unit_price = $2
       WHERE id = $3
       RETURNING *`,
      [
        Number(quantity) || 0,
        Number(unit_price) || 0,
        req.params.id
      ]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: "Bidhaa haijapatikana" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* PURCHASES AND SUPPLIERS */

app.post("/api/products/:id/purchase", async (req, res) => {
  const client = await pool.connect();

  try {
    const productId = Number(req.params.id);
    const quantity = Number(req.body.quantity);
    const unitCost = Number(req.body.unit_cost) || 0;
    const supplierName = req.body.supplier_name
      ? req.body.supplier_name.trim()
      : "";

    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        error: "Quantity lazima iwe zaidi ya sifuri"
      });
    }

    await client.query("BEGIN");

    const product = await client.query(
      `UPDATE products
       SET quantity = quantity + $1
       WHERE id = $2
       RETURNING *`,
      [quantity, productId]
    );

    if (!product.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        error: "Bidhaa haijapatikana"
      });
    }

    const totalCost = quantity * unitCost;

    await client.query(
      `INSERT INTO purchases
       (product_id, quantity, unit_cost, total_cost, supplier_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        productId,
        quantity,
        unitCost,
        totalCost,
        supplierName || null
      ]
    );

    if (supplierName) {
      await client.query(
        `INSERT INTO suppliers (name, balance_due)
         VALUES ($1, $2)
         ON CONFLICT (name)
         DO UPDATE SET balance_due =
         suppliers.balance_due + EXCLUDED.balance_due`,
        [supplierName, totalCost]
      );
    }

    await client.query("COMMIT");
    res.json(product.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get("/api/suppliers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        s.id,
        s.name,
        COALESCE(SUM(p.total_cost), 0) AS total_purchases,
        s.balance_due
      FROM suppliers s
      LEFT JOIN purchases p
        ON LOWER(TRIM(p.supplier_name)) =
           LOWER(TRIM(s.name))
      GROUP BY s.id, s.name, s.balance_due
      ORDER BY s.id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/suppliers", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const balance = Number(req.body.balance_due) || 0;

    if (!name) {
      return res.status(400).json({
        error: "Jina la supplier linahitajika"
      });
    }

    const result = await pool.query(
      `INSERT INTO suppliers (name, balance_due)
       VALUES ($1, $2)
       ON CONFLICT (name)
       DO UPDATE SET balance_due =
       suppliers.balance_due + EXCLUDED.balance_due
       RETURNING *`,
      [name, balance]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* SALES AND CUSTOMERS */

app.get("/api/sales", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sales ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sales", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      item_name,
      quantity,
      unit_price,
      payment_status,
      customer_name
    } = req.body;

    const qty = Number(quantity) || 1;
    const price = Number(unit_price) || 0;
    const total = qty * price;
    const customer = customer_name?.trim() || "";

    await client.query("BEGIN");

    const sale = await client.query(
      `INSERT INTO sales
       (item_name, quantity, unit_price, total_amount,
        payment_status, customer_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        item_name || "Bidhaa",
        qty,
        price,
        total,
        payment_status || "Paid",
        customer
      ]
    );

    if (payment_status === "Credit" && customer) {
      await client.query(
        `INSERT INTO customers (name, outstanding_balance)
         VALUES ($1, $2)
         ON CONFLICT (name)
         DO UPDATE SET outstanding_balance =
         customers.outstanding_balance + EXCLUDED.outstanding_balance`,
        [customer, total]
      );
    }

    await client.query("COMMIT");
    res.json(sale.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete("/api/sales/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM sales WHERE id = $1", [
      req.params.id
    ]);

    res.json({ message: "Sale imefutwa" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/customers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        c.id,
        c.name,
        COALESCE(SUM(
          CASE
            WHEN s.payment_status = 'Credit'
            THEN s.total_amount
            ELSE 0
          END
        ), 0) AS total_credit_sales,
        c.outstanding_balance
      FROM customers c
      LEFT JOIN sales s
        ON LOWER(TRIM(s.customer_name)) =
           LOWER(TRIM(c.name))
      GROUP BY c.id, c.name, c.outstanding_balance
      ORDER BY c.id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const balance = Number(req.body.outstanding_balance) || 0;

    if (!name) {
      return res.status(400).json({
        error: "Jina la customer linahitajika"
      });
    }

    const result = await pool.query(
      `INSERT INTO customers (name, outstanding_balance)
       VALUES ($1, $2)
       ON CONFLICT (name)
       DO UPDATE SET outstanding_balance =
       customers.outstanding_balance + EXCLUDED.outstanding_balance
       RETURNING *`,
      [name, balance]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* EXPENSES */

app.get("/api/expenses", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM expenses ORDER BY id DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
    const {
      category,
      amount,
      paid_from,
      notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO expenses
       (category, amount, paid_from, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        category || "Others",
        Number(amount) || 0,
        paid_from || "Cash",
        notes || ""
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* DASHBOARD */

app.get("/api/dashboard", async (req, res) => {
  try {
    const sales = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales"
    );

    const expenses = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses"
    );

    const totalSales = Number(sales.rows[0].total);
    const totalExpenses = Number(expenses.rows[0].total);

    res.json({
      sales: totalSales,
      expenses: totalExpenses,
      profit: totalSales - totalExpenses
    });
  } catch (err) {
    res.status(500).json({
      sales: 0,
      expenses: 0,
      profit: 0
    });
  }
});

/* REPORT */

app.get("/api/reports/profit-loss", async (req, res) => {
  try {
    const sales = await pool.query(
      "SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales"
    );

    const expenses = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM expenses"
    );

    const totalSales = Number(sales.rows[0].total);
    const totalExpenses = Number(expenses.rows[0].total);

    res.json({
      totalSales,
      totalExpenses,
      netProfit: totalSales - totalExpenses
    });
  } catch (err) {
    res.status(500).json({
      totalSales: 0,
      totalExpenses: 0,
      netProfit: 0
    });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

async function startServer() {
  await initDb();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
