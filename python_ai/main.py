# python_ai/main.py
import sys
import json
import base64
import cv2
import numpy as np
from vision_processor import VisionProcessor
from chexnet import ChexNet
from heatmap import HeatmapGenerator
import traceback

class AIService:
    def __init__(self):
        self.processor = VisionProcessor()
        self.chexnet = ChexNet()
        self.heatmap = HeatmapGenerator()
    
    def analyze(self, image_data):
        """Analyze chest X-ray image"""
        try:
            # Decode base64 image
            image_bytes = base64.b64decode(image_data)
            nparr = np.frombuffer(image_bytes, np.uint8)
            image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if image is None:
                raise ValueError("Failed to decode image")
            
            # Process image
            processed = self.processor.preprocess(image)
            
            # Run inference
            predictions = self.chexnet.predict(processed)
            
            # Generate heatmap
            heatmap = self.heatmap.generate(processed, predictions)
            
            # Format results
            results = self.processor.format_predictions(predictions)
            
            return {
                "success": True,
                "findings": results,
                "abnormalities": results,
                "hasAbnormalities": any(f["probability"] > 70 for f in results),
                "summary": self.generate_summary(results),
                "heatmap": heatmap if heatmap is not None else None
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "traceback": traceback.format_exc()
            }
    
    def generate_summary(self, findings):
        """Generate human-readable summary"""
        high_risk = [f for f in findings if f["probability"] > 80 and f["name"] != "Normal"]
        
        if high_risk:
            return f"High risk findings detected: {', '.join([f['name'] for f in high_risk])}"
        elif findings:
            return "No significant abnormalities detected"
        else:
            return "Analysis complete"


# Mock implementations for development
class VisionProcessor:
    def preprocess(self, image):
        # Resize, normalize, etc.
        return cv2.resize(image, (224, 224))
    
    def format_predictions(self, predictions):
        # Format predictions as list of findings
        findings = [
            {
                "name": "Normal Lung Fields",
                "probability": 87.5,
                "color": "#10B981",
                "description": "No significant abnormalities detected",
                "recommendations": ["Regular follow-up"]
            },
            {
                "name": "Clear Costophrenic Angles",
                "probability": 92.3,
                "color": "#3B82F6",
                "description": "Costophrenic angles are sharp",
                "recommendations": []
            }
        ]
        
        # Add some variability
        import random
        if random.random() > 0.6:
            findings.append({
                "name": "Mild Opacity",
                "probability": 67.8,
                "color": "#F59E0B",
                "description": "Subtle opacity noted",
                "recommendations": ["Clinical correlation advised"]
            })
        
        return findings

class ChexNet:
    def predict(self, image):
        import random
        return {
            "normal": random.random() * 20 + 70,
            "opacity": random.random() * 30,
            "pneumonia": random.random() * 20
        }

class HeatmapGenerator:
    def generate(self, image, predictions):
        # Generate dummy heatmap
        return None


if __name__ == "__main__":
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        if not input_data:
            print(json.dumps({"success": False, "error": "No input data"}))
            sys.exit(1)
        
        # Parse JSON
        data = json.loads(input_data)
        image_data = data.get("image")
        
        if not image_data:
            print(json.dumps({"success": False, "error": "No image data provided"}))
            sys.exit(1)
        
        # Initialize service and analyze
        service = AIService()
        result = service.analyze(image_data)
        
        # Output result
        print(json.dumps(result))
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e),
            "traceback": traceback.format_exc()
        }))
        sys.exit(1)