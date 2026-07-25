require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./src/routes/api');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api', apiRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`MedVision AI backend running on port ${PORT}`));
