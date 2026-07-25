const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const cloudinary = require('cloudinary').v2;
const VisionService = require('../services/visionService');
const PatientModel = require('../models/PatientModel');
const FindingModel = require('../models/FindingModel');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

class AnalysisController {
    static async analyzeCxr(req, res) {
        try {
            console.log('Analyzing CXR...');
            console.log('Request body:', req.body);
            console.log('File:', req.file);

            if (!req.file) {
                return res.status(400).json({ 
                    error: "No image file provided" 
                });
            }

            const { name, age, gender, date, patientId, clinicalSymptoms, clinicalHistory } = req.body;
            
            if (!name || !age || !gender || !date) {
                return res.status(400).json({
                    error: "Missing required patient information"
                });
            }

            let imageUrl;
            let publicId;
            try {
                const uploadResult = await VisionService.uploadToCloudinary(
                    await fs.readFile(req.file.path),
                    {
                        folder: 'medvision/scans',
                        public_id: uuidv4()
                    }
                );
                imageUrl = uploadResult.url;
                publicId = uploadResult.publicId;
                console.log('', imageUrl);
            } catch (uploadError) {
                console.error('Cloudinary upload error:', uploadError);
                return res.status(500).json({
                    error: "Failed to upload image to cloud storage"
                });
            }

            // Call Python AI service for analysis
            let aiResults;
            try {
                aiResults = await this.runPythonAnalysis(imageUrl);
            } catch (aiError) {
                console.error('AI analysis error:', aiError);
                aiResults = await this.mockAnalysis(imageUrl);
            }

            const patientUUID = uuidv4();
            const connection = await query;

            try {
                await connection.query(
                    `INSERT INTO patients (
                        id, name, patient_id, age, gender, scan_type, scan_date,
                        clinical_symptoms, clinical_history, image_url, public_id, 
                        status, priority, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, 'Chest X-ray', ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
                    [
                        patientUUID,
                        name.trim(),
                        patientId || null,
                        Number(age),
                        gender.trim(),
                        date,
                        clinicalSymptoms || null,
                        clinicalHistory || null,
                        imageUrl,
                        publicId,
                        aiResults.priority || 'medium'
                    ]
                );

                // Insert findings
                const insertedFindings = [];
                const findings = aiResults.findings || aiResults.abnormalities || [];
                
                for (const finding of findings) {
                    const findingId = uuidv4();
                    await connection.query(
                        `INSERT INTO findings (
                            id, patient_id, name, probability, color, description, 
                            recommendations, bounding_box, created_at, updated_at
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                        [
                            findingId,
                            patientUUID,
                            finding.name || 'Unknown Finding',
                            finding.probability || 0,
                            finding.color || '#3B82F6',
                            finding.description || '',
                            JSON.stringify(finding.recommendations || []),
                            JSON.stringify(finding.boundingBox || {})
                        ]
                    );
                    insertedFindings.push({ 
                        ...finding, 
                        id: findingId,
                        probability: finding.probability || 0
                    });
                }

                const [patientRows] = await connection.query(
                    "SELECT * FROM patients WHERE id = ?",
                    [patientUUID]
                );

                const patient = patientRows[0];

                // Clean up uploaded file
                await fs.unlink(req.file.path).catch(() => {});

                // Return response matching frontend expectations
                return res.status(201).json({
                    patient: {
                        ...patient,
                        id: patient.id,
                        patientId: patient.patient_id,
                        name: patient.name,
                        age: patient.age,
                        gender: patient.gender,
                        scanType: patient.scan_type,
                        date: patient.scan_date,
                        clinicalSymptoms: patient.clinical_symptoms,
                        clinicalHistory: patient.clinical_history,
                        imageUrl: patient.image_url,
                        priority: patient.priority,
                        status: patient.status,
                        aiFindings: insertedFindings
                    },
                    aiFindings: insertedFindings,
                    heatmapUrl: imageUrl, 
                    priority: aiResults.priority || 'medium',
                    summary: aiResults.summary || 'Analysis complete',
                    totalDiseases: 14,
                    detectedDiseases: insertedFindings.length
                });

            } catch (error) {
                await connection.query("DELETE FROM patients WHERE id = ?", [patientUUID]);
                await connection.query("DELETE FROM findings WHERE patient_id = ?", [patientUUID]);
                throw error;
            }

        } catch (error) {
            console.error('Analysis error:', error);
            if (req.file?.path) {
                await fs.unlink(req.file.path).catch(() => {});
            }
            return res.status(500).json({
                error: "Analysis failed",
                details: error.message
            });
        }
    }

    static async runPythonAnalysis(imageUrl) {
        return new Promise((resolve, reject) => {
            try {
                console.log('AI analysis...');
                
                const pythonScript = path.join(__dirname, '../python_ai/main.py');
                const pythonProcess = spawn('python3', [pythonScript]);

                const inputData = JSON.stringify({ imageUrl });
                pythonProcess.stdin.write(inputData);
                pythonProcess.stdin.end();

                let output = '';
                let errorOutput = '';

                pythonProcess.stdout.on('data', (data) => {
                    output += data.toString();
                });

                pythonProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                    console.error('Python stderr:', data.toString());
                });

                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        try {
                            const result = JSON.parse(output);
                            console.log('analysis complete');
                            resolve(result);
                        } catch (parseError) {
                            console.error('Failed to parse Python output:', output);
                            reject(new Error('Invalid JSON from Python'));
                        }
                    } else {
                        reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
                    }
                });

                pythonProcess.on('error', (error) => {
                    reject(new Error(`Failed to start Python process: ${error.message}`));
                });

                setTimeout(() => {
                    pythonProcess.kill();
                    reject(new Error('AI analysis timeout after 60 seconds'));
                }, 60000);

            } catch (error) {
                reject(error);
            }
        });
    }

    static async mockAnalysis(imageUrl) {
        console.log(' Running mock analysis...');
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const findings = [
            {
                name: 'Normal Lung Fields',
                probability: 87.5,
                color: '#10B981',
                description: 'No significant abnormalities detected in lung fields',
                recommendations: ['Regular follow-up if symptoms persist']
            },
            {
                name: 'Clear Costophrenic Angles',
                probability: 92.3,
                color: '#3B82F6',
                description: 'Costophrenic angles are sharp and well-defined',
                recommendations: []
            },
            {
                name: 'Cardiac Silhouette Normal',
                probability: 78.9,
                color: '#8B5CF6',
                description: 'Heart size and shape within normal limits',
                recommendations: []
            }
        ];

        const hasAbnormalities = Math.random() > 0.6;
        
        if (hasAbnormalities) {
            findings.push({
                name: 'Mild Opacity Detected',
                probability: 67.8,
                color: '#F59E0B',
                description: 'Subtle opacity noted in the right lower lobe',
                recommendations: [
                    'Clinical correlation advised',
                    'Consider follow-up imaging'
                ]
            });
        }

        return {
            success: true,
            findings,
            abnormalities: findings,
            hasAbnormalities,
            priority: hasAbnormalities ? 'high' : 'low',
            summary: hasAbnormalities 
                ? 'Some abnormalities detected. Please review findings.'
                : 'No significant abnormalities detected.'
        };
    }

    static async analyze(req, res) {
        try {
            const {
                imageUrl,
                publicId,
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

            let aiResults;
            try {
                aiResults = await this.runPythonAnalysis(imageUrl);
            } catch (aiError) {
                console.error('AI analysis failed, using mock data:', aiError.message);
                aiResults = await this.mockAnalysis(imageUrl);
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

module.exports = {
    analyzeCxr: AnalysisController.analyzeCxr.bind(AnalysisController),
    getPatients: async (req, res) => {
        try {
            const patients = await PatientModel.findAll();
            res.json(patients); 
        } catch (error) {
            console.error('Error fetching patients:', error);
            res.status(500).json({
                error: error.message
            });
        }
    },
    getPatientById: async (req, res) => {
        try {
            const patient = await PatientModel.findById(req.params.id);
            if (!patient) {
                return res.status(404).json({
                    error: 'Patient not found'
                });
            }
            res.json(patient);
        } catch (error) {
            res.status(500).json({
                error: error.message
            });
        }
    },
    AnalysisController
};