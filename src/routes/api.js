const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const AnalysisController = require('../controllers/analysisController');
const PatientModel = require('../models/PatientModel');
const FindingModel = require('../models/FindingModel');


router.post('/analyze', AnalysisController.analyze);


router.get('/patients', async (req, res) => {
    try {
        const patients = await PatientModel.findAll();
        res.json({
            success: true,
            patients
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get patient by ID
router.get('/patients/:id', async (req, res) => {
    try {
        const patient = await PatientModel.findById(req.params.id);
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        res.json({
            success: true,
            patient
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Create patient
router.post('/patients', async (req, res) => {
    try {
        const patient = await PatientModel.create(req.body);
        res.status(201).json({
            success: true,
            patient
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.put('/patients/:id', async (req, res) => {
    try {
        const patient = await PatientModel.update(req.params.id, req.body);
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        res.json({
            success: true,
            patient
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.patch('/patients/:id/priority', async (req, res) => {
    try {
        const { priority } = req.body;
        const validPriorities = ['critical', 'high', 'medium', 'low'];
        
        if (!validPriorities.includes(priority)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid priority. Must be: critical, high, medium, low'
            });
        }

        const patient = await PatientModel.updatePriority(req.params.id, priority);
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        res.json({
            success: true,
            patient
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.patch('/patients/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['pending', 'reviewed', 'consulting', 'completed'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Must be: pending, reviewed, consulting, completed'
            });
        }

        const patient = await PatientModel.updateStatus(req.params.id, status);
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        res.json({
            success: true,
            patient
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/patients/:id/request-review', async (req, res) => {
    try {
        const patient = await PatientModel.requestReview(req.params.id);
        if (!patient) {
            return res.status(404).json({
                success: false,
                error: 'Patient not found'
            });
        }
        res.json({
            success: true,
            message: 'Review requested successfully',
            patient
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.delete('/patients/:id', async (req, res) => {
    try {
        await PatientModel.delete(req.params.id);
        res.json({
            success: true,
            message: 'Patient deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});



router.get('/patients/:id/findings', async (req, res) => {
    try {
        const findings = await FindingModel.findByPatientId(req.params.id);
        res.json({
            success: true,
            findings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/patients/:id/findings', async (req, res) => {
    try {
        const finding = await FindingModel.create(req.params.id, req.body);
        res.status(201).json({
            success: true,
            finding
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Delete finding
router.delete('/findings/:id', async (req, res) => {
    try {
        await FindingModel.delete(req.params.id);
        res.json({
            success: true,
            message: 'Finding deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ==================== STATISTICS ====================

router.get('/patients/stats', async (req, res) => {
    try {
        const stats = await PatientModel.getStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;