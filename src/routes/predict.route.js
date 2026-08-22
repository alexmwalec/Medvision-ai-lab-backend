const express = require('express');
const upload = require('../middleware/upload');
const { handlePredict } = require('../controllers/predict.controller');
const {
  getPatients,
  getPatientById,
  requestFeedback,
} = require('../controllers/analysisController');

const router = express.Router();

router.post('/predict', upload.single('xray'), handlePredict);
router.get('/patients', getPatients);
router.get('/patients/:id', getPatientById);
router.post('/feedback', requestFeedback);

module.exports = router;
