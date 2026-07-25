const express = require('express');
const router = express.Router();

const upload = require('../middleware/upload');
const ctrl = require('../controllers/analysisController');

router.post('/analyze_cxr', upload.single('image'), ctrl.analyzeCxr);

router.get('/patients', ctrl.getPatients);
router.get('/patients/stats', ctrl.getStats);
router.get('/patients/:id', ctrl.getPatientById);
router.patch('/patients/:id/status', ctrl.updateStatus);
router.patch('/patients/:id/priority', ctrl.updatePriority);
router.delete('/patients/:id', ctrl.deletePatient);

router.post('/feedback', ctrl.requestFeedback);

module.exports = router;
