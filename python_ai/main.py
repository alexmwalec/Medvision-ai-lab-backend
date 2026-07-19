#!/usr/bin/env python3
import sys
import json
import base64
from vision_processor import VisionProcessor
from models.chexnet import CheXNet14
import cv2
import numpy as np

class MedVisionAI:
    def __init__(self):
        self.vision = VisionProcessor()
        self.model = CheXNet14()
    
    def analyze(self, data):
        """Main analysis function combining vision and AI"""
        
        # Get image bytes
        image_bytes = data.get('image_bytes')
        if image_bytes:
            # Decode base64 if needed
            if isinstance(image_bytes, str):
                image_bytes = base64.b64decode(image_bytes)
            
            # Run vision processing
            vision_results = self.vision.analyze_image(image_bytes)
        else:
            vision_results = {'abnormalities': [], 'heatmap': None, 'annotated_image': None}
        
        # Run CheXNet-14 prediction
        model_results = self.model.predict(
            age=data.get('age'),
            gender=data.get('gender'),
            clinical_symptoms=data.get('clinicalSymptoms', ''),
            clinical_history=data.get('clinicalHistory', '')
        )
        
        # Combine results
        combined_findings = []
        
        # Add vision-based findings
        for ab in vision_results.get('abnormalities', []):
            combined_findings.append({
                'name': ab['condition'],
                'probability': round(ab['confidence'] * 100),
                'color': self._get_color(ab['condition']),
                'description': self._get_description(ab['condition']),
                'recommendations': self._get_recommendations(ab['condition']),
                'boundingBox': {
                    'x': ab['bbox'][0],
                    'y': ab['bbox'][1],
                    'width': ab['bbox'][2],
                    'height': ab['bbox'][3],
                    'color': self._get_color(ab['condition'])
                }
            })
        
        # Add model-based findings
        for finding in model_results.get('findings', []):
            # Check if already added from vision
            if not any(f['name'] == finding['name'] for f in combined_findings):
                combined_findings.append(finding)
        
        # Sort by probability
        combined_findings.sort(key=lambda x: x['probability'], reverse=True)
        
        # Determine priority
        max_prob = max([f['probability'] for f in combined_findings]) if combined_findings else 0
        if max_prob >= 85:
            priority = "high"
        elif max_prob >= 65:
            priority = "medium"
        else:
            priority = "low"
        
        return {
            'findings': combined_findings,
            'priority': priority,
            'totalDetected': len(combined_findings),
            'vision_processed': vision_results.get('heatmap') is not None
        }
    
    def _get_color(self, condition):
        colors = {
            "Pneumonia": "#00B894",
            "Pleural Effusion": "#00CEC9",
            "Tuberculosis Pattern": "#FDCB6E",
            "Nodule": "#E17055",
            "Cardiomegaly": "#FF4757",
            "Atelectasis": "#FF6B6B",
            "Consolidation": "#FF6B81",
            "Edema": "#FF9F43",
            "Emphysema": "#FECA57",
            "Fibrosis": "#A29BFE"
        }
        return colors.get(condition, "#6B7280")
    
    def _get_description(self, condition):
        descriptions = {
            "Pneumonia": "Lower-zone air-space opacity requiring clinical correlation.",
            "Pleural Effusion": "Fluid collection in pleural space. Blunting of costophrenic angle.",
            "Tuberculosis Pattern": "Upper-zone chronic infection pattern.",
            "Nodule": "Small round opacity < 3cm. Requires surveillance.",
            "Cardiomegaly": "Enlargement of the heart. Cardiothoracic ratio > 0.5."
        }
        return descriptions.get(condition, "Abnormality detected in lung region.")
    
    def _get_recommendations(self, condition):
        recommendations = {
            "Pneumonia": ["Correlate with symptoms", "Consider antibiotic therapy"],
            "Pleural Effusion": ["Ultrasound for volume assessment", "Diuretic therapy"],
            "Tuberculosis Pattern": ["Sputum testing", "Infectious disease consultation"],
            "Nodule": ["CT follow-up", "Monitor for growth"],
            "Cardiomegaly": ["Echocardiogram", "Monitor blood pressure"]
        }
        return recommendations.get(condition, ["Clinical correlation needed"])

def main():
    try:
        data = json.loads(sys.stdin.read())
        ai = MedVisionAI()
        result = ai.analyze(data)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()