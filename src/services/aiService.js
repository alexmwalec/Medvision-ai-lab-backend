const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

class AIService {
    static async analyzeImage(imageUrl) {
        try {
            console.log('Starting AI analysis...');
            
            const imageResponse = await axios.get(imageUrl, {
                responseType: 'arraybuffer'
            });
            
            const imageBase64 = Buffer.from(imageResponse.data, 'binary').toString('base64');

            const pythonScript = path.join(__dirname, '../python_ai/main.py');
            const pythonProcess = spawn('python3', [pythonScript]);

            const inputData = JSON.stringify({ image: imageBase64 });
            pythonProcess.stdin.write(inputData);
            pythonProcess.stdin.end();

            // Collect output
            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.error('Python stderr:', data.toString());
            });

            await new Promise((resolve, reject) => {
                pythonProcess.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Python process exited with code ${code}: ${errorOutput}`));
                    }
                });

                pythonProcess.on('error', (error) => {
                    reject(new Error(`Failed to start Python process: ${error.message}`));
                });
            });

            try {
                const result = JSON.parse(output);
                console.log('✅ AI analysis complete');
                return result;
            } catch (parseError) {
                console.error('Failed to parse Python output:', output);
                throw new Error(`Invalid JSON from Python: ${output}`);
            }

        } catch (error) {
            console.error('AI analysis failed:', error.message);
            throw error;
        }
    }

    static async mockAnalysis(imageUrl) {
        console.log('🔍 Running mock analysis...');
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Generate realistic mock findings
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

        // Randomly determine if there are abnormalities
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
            abnormalities: findings,
            hasAbnormalities,
            findings: findings,
            summary: hasAbnormalities 
                ? 'Some abnormalities detected. Please review findings.'
                : 'No significant abnormalities detected.'
        };
    }
}

module.exports = AIService;