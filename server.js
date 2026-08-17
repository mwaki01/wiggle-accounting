const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Data za Mfumo
let inventory = [
  { id: 1, name: 'Soda (Chupa)', quantity: 100, unit_price: 1000 }
];

let sales = [];

let customers = [
  { id: 1, name: 'Amani Store', outstanding_balance: 45000 },
  { id: 2, name: 'Juma Retail', outstanding_balance: 12000 }
];

let suppliers = [
  { id: 1, name: 'Bakhresa Group', balance_due: 150000 },
  { id: 2, name: 'Coca Cola Supplies', balance_due: 80000 }
];

// --- ROUTES ---

app.get('/', (req, res) => {
  res.send('Wiggle Accounting Backend API is Running Successfully!');
});

// 1. Customers API
app.get('/api/customers', (req, res) => {
  try {
    res.status(200).json(customers);
  } catch (error) {
    res.status(500).json({ error: "Imeshindwa kuvuta taarifa za wateja." });
  }
});

// 2. Suppliers API
app.get('/api/suppliers', (req, res) => {
  try {
    res.status(200).json(suppliers);
  } catch (error) {
    res.status(500).json({ error: "Imeshindwa kuvuta taarifa za wauzaji." });
  }
});

// 3. Sales API (Ina Idadi ya Chupa & Delete)
app.get('/api/sales', (req, res) => {
  res.status(200).json(sales);
});

app.post('/api/sales', (req, res) => {
  const { item_name, quantity, unit_price } = req.body;
  if (!quantity || !unit_price) {
    return res.status(400).json({ error: "Ingiza idadi na bei ya kila chupa/bidhaa." });
  }

  const newSale = {
    id: Date.now(),
    item_name: item_name || 'Bidhaa Isiyojulikana',
    quantity: Number(quantity),
    unit_price: Number(unit_price),
    total: Number(quantity) * Number(unit_price),
    date: new Date().toISOString()
  };

  sales.push(newSale);
  res.status(201).json({ message: "Mauzo yamefanikiwa", sale: newSale });
});

app.delete('/api/sales/:id', (req, res) => {
  const { id } = req.params;
  sales = sales.filter(s => s.id !== Number(id));
  res.status(200).json({ message: "Mauzo yamefutwa" });
});

// 4. Profit & Loss Report API (Haikwami)
app.get('/api/reports/profit-loss', (req, res) => {
  try {
    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalExpenses = 50000;
    const netProfit = totalSales - totalExpenses;

    res.status(200).json({
      totalSales,
      totalExpenses,
      netProfit,
      status: "success"
    });
  } catch (err) {
    res.status(500).json({ error: "Imeshindwa kutengeneza ripoti ya P&L." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));