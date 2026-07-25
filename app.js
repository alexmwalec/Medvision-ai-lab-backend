const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

app.use(cors({
    origin: '*',
    credentials: true
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const apiRoutes = require('./src/routes/api');
app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'MedVision AI Backend is running',
        timestamp: new Date().toISOString()
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err.stack);
    res.status(500).json({
        error: err.message || 'Something went wrong!'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`API endpoint: http://localhost:${PORT}/api`);
});