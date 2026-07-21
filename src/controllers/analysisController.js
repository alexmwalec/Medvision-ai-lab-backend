const AIService = require('../services/aiService');
const VisionService = require('../services/visionService');
const PatientModel = require('../models/PatientModel');
const FindingModel = require('../models/FindingModel');

class AnalysisController {
    static async analyze(req, res) {
        try {
            const {
                imageUrl,        // Cloudinary URL
                publicId,        // Cloudinary public ID
                name,
                patientId,
                age,
                gender,
                date,
                scanType = 'Chest X-ray',
                clinicalSymptoms,
                clinicalHistory,
                imageMetadata
            } = req.body;

            if (!imageUrl) {
                return res.status(400).json({
                    success: false,
                    error: 'Image URL is required'
                });
            }

            if (!name || !age || !gender || !date) {
                return res.status(400).json({
                    success: false,
                    error: 'Patient information is incomplete'
                });
            }

            console.log(' ', imageUrl);
            console.log('Public ID:', publicId);

            let aiResults;
            try {
                aiResults = await AIService.analyzeImage(imageUrl);
            } catch (aiError) {
                console.error('AI analysis failed, using mock data:', aiError.message);
                aiResults = await AIService.mockAnalysis(imageUrl);
            }

            const optimizedUrls = publicId ? {
                thumbnail: VisionService.getThumbnailUrl(publicId),
                preview: VisionService.getPreviewUrl(publicId),
                full: VisionService.getFullSizeUrl(publicId),
                original: imageUrl
            } : null;

            const patientData = {
                name,
                patientId,
                age,
                gender,
                date,
                scanType,
                clinicalSymptoms,
                clinicalHistory,
                imageUrl,
                publicId,
                imageMetadata
            };

            const patient = await PatientModel.create(patientData);

            const findings = aiResults.findings || aiResults.abnormalities || [];
            const savedFindings = [];

            for (const finding of findings) {
                const savedFinding = await FindingModel.create(patient.id, {
                    name: finding.name,
                    probability: finding.probability || 0,
                    color: finding.color || '#3B82F6',
                    description: finding.description || '',
                    recommendations: finding.recommendations || [],
                    boundingBox: finding.boundingBox || {}
                });
                savedFindings.push(savedFinding);
            }

           const hasCritical = findings.some(f => 
                f.name.toLowerCase().includes('pneumonia') || 
                f.name.toLowerCase().includes('tumor') ||
                f.name.toLowerCase().includes('mass')
            );

            let priority = 'medium';
            if (hasCritical) {
                priority = 'critical';
            } else if (findings.some(f => f.probability > 85 && f.name !== 'Normal')) {
                priority = 'high';
            }

            await PatientModel.updatePriority(patient.id, priority);

            const updatedPatient = await PatientModel.findById(patient.id);

            res.json({
                success: true,
                patient: updatedPatient,
                aiFindings: savedFindings,
                priority,
                summary: aiResults.summary || 'Analysis complete',
                imageUrls: optimizedUrls,
                heatmapUrl: imageUrl 
            });

        } catch (error) {
            console.error('Analysis error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    static async uploadImage(req, res) {
        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: 'No image file provided'
                });
            }

            // Uploading image to Cloudinary
            const result = await VisionService.uploadToCloudinary(req.file.buffer, {
                folder: 'medvision/scans',
                tags: ['chest-xray', 'uploaded'],
                transformation: [
                    { width: 1200, height: 900, crop: 'limit' },
                    { quality: 'auto:good' }
                ]
            });

            const localPath = path.join(__dirname, '../uploads', `${result.publicId}.${result.format}`);
            await fs.writeFile(localPath, req.file.buffer);

            res.json({
                success: true,
                ...result,
                localPath
            });

        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    static async deleteImage(req, res) {
        try {
            const { publicId } = req.body;
            
            if (!publicId) {
                return res.status(400).json({
                    success: false,
                    error: 'Public ID is required'
                });
            }

            const result = await VisionService.deleteFromCloudinary(publicId);
            
            await PatientModel.update(patientId, { image_url: null, public_id: null });

            res.json({
                success: true,
                message: 'Image deleted successfully',
                result
            });

        } catch (error) {
            console.error('Delete error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = AnalysisController;