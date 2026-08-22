require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const predictRoutes = require('./src/routes/predict.route');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000' }));
app.use(express.json());

// The inference pipeline stores original images and Grad-CAM output under
// uploads/patients. Expose that directory through the same API base used by
// the frontend.
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', predictRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// Port 8000 is reserved for the Python inference service. Keep the public
// Express API separate so /api/predict can proxy inference requests to it.
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`MedVision AI backend running on port ${PORT}`));
