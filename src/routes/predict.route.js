const express = require('express');
const upload = require('../middleware/upload');
const { handlePredict } = require('../controllers/predict.controller');

const router = express.Router();

router.post('/predict', upload.single('xray'), handlePredict);

module.exports = router;
