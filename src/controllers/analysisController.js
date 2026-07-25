const fs = require('fs');
const PatientModel = require('../models/PatientModel');
const FindingModel = require('../models/FindingModel');
const AIService = require('../services/aiService');
const HeatmapService = require('../services/heatmap');
const { validateAnalyzeRequest } = require('../utils/validators');

async function analyzeCxr(req, res) {
  const errors = validateAnalyzeRequest(req.body, req.file);
  if (errors.length > 0) {
    if (req.file?.path) await fs.promises.rm(req.file.path, { force: true }).catch(() => {});
    return res.status(400).json({ success: false, error: 'Invalid request', details: errors });
  }

  try {
    const aiResult = await AIService.mockAnalysis();

    const imageFilename = req.file.filename;

    const heatmapFilename = await HeatmapService.generateHeatmap(req.file.path, aiResult.findings);

    const patient = await PatientModel.create({
      patientId: req.body.patientId,
      name: req.body.name.trim(),
      age: req.body.age,
      gender: req.body.gender,
      scanType: req.body.scanType || 'Chest X-ray',
      date: req.body.date,
      clinicalSymptoms: req.body.clinicalSymptoms,
      clinicalHistory: req.body.clinicalHistory,
      imageFilename,
      heatmapFilename,
      status: 'pending',
      priority: aiResult.priority
    });

    const savedFindings = [];
    for (const finding of aiResult.findings) {
      const saved = await FindingModel.create(patient.id, finding);
      savedFindings.push({ ...finding, id: saved.id });
    }

    const updatedPatient = await PatientModel.findById(patient.id);

    return res.status(201).json({
      success: true,
      patient: updatedPatient,
      aiFindings: savedFindings,
      heatmapUrl: updatedPatient.heatmapUrl,
      priority: aiResult.priority,
      model: 'CheXNet-14 (simulated)',
      totalDiseases: 14,
      detectedDiseases: savedFindings.length,
      summary: aiResult.summary,
      message: 'CXR analysis completed using simulated CheXNet-14.'
    });
  } catch (error) {
    if (req.file?.path) await fs.promises.rm(req.file.path, { force: true }).catch(() => {});
    console.error('Analyze error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function getPatients(req, res) {
  try {
    const patients = await PatientModel.findAll();
    res.json({ success: true, patients });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getPatientById(req, res) {
  try {
    const patient = await PatientModel.findById(req.params.id);
    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
    res.json({ success: true, patient });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function updateStatus(req, res) {
  try {
    const { status } = req.body;
    const valid = ['pending', 'reviewed', 'consulting', 'completed'];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, error: `Invalid status. Must be: ${valid.join(', ')}` });
    }
    const patient = await PatientModel.updateStatus(req.params.id, status);
    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
    res.json({ success: true, patient });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function updatePriority(req, res) {
  try {
    const { priority } = req.body;
    const valid = ['critical', 'high', 'medium', 'low'];
    if (!valid.includes(priority)) {
      return res.status(400).json({ success: false, error: `Invalid priority. Must be: ${valid.join(', ')}` });
    }
    const patient = await PatientModel.updatePriority(req.params.id, priority);
    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
    res.json({ success: true, patient });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// Backs the "Send to Radiologist" button on the Consult page, which POSTs
// to /api/feedback with { patientId, type, status }.
async function requestFeedback(req, res) {
  try {
    const { patientId, type, status } = req.body;
    if (!patientId) return res.status(400).json({ success: false, error: 'patientId is required' });

    const patient = await PatientModel.updateStatus(patientId, status || 'consulting');
    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });

    res.json({
      success: true,
      message: 'Feedback recorded',
      type: type || 'radiologist_review_requested',
      patient
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function deletePatient(req, res) {
  try {
    await FindingModel.deleteByPatientId(req.params.id);
    await PatientModel.delete(req.params.id);
    res.json({ success: true, message: 'Patient deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

async function getStats(req, res) {
  try {
    const stats = await PatientModel.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  analyzeCxr,
  getPatients,
  getPatientById,
  updateStatus,
  updatePriority,
  requestFeedback,
  deletePatient,
  getStats
};
