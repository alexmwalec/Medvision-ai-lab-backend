#!/usr/bin/env python3
import sys
import json
import random

class CheXNet14:
    def __init__(self):
        self.diseases = {
            "Atelectasis": {
                "color": "#FF6B6B",
                "description": "Collapse of lung tissue affecting air exchange. Often seen as linear opacities.",
                "recommendations": ["Deep breathing exercises", "Monitor oxygen saturation", "Evaluate for underlying causes"],
                "region": {"x": 0.25, "y": 0.25, "width": 0.3, "height": 0.3}
            },
            "Cardiomegaly": {
                "color": "#FF4757",
                "description": "Enlargement of the heart. Cardiothoracic ratio > 0.5 indicates potential pathology.",
                "recommendations": ["Echocardiogram recommended", "Monitor blood pressure", "Consider cardiac consultation"],
                "region": {"x": 0.32, "y": 0.35, "width": 0.35, "height": 0.3}
            },
            "Consolidation": {
                "color": "#FF6B81",
                "description": "Airspace filled with fluid or pus. Common in pneumonia and infections.",
                "recommendations": ["Antibiotic therapy if infectious", "Chest physiotherapy", "Follow-up imaging in 2-3 weeks"],
                "region": {"x": 0.3, "y": 0.3, "width": 0.28, "height": 0.28}
            },
            "Edema": {
                "color": "#FF9F43",
                "description": "Pulmonary edema with Kerley B lines and perihilar haze. Usually cardiac in origin.",
                "recommendations": ["Diuretic therapy consideration", "Cardiac assessment", "Monitor fluid balance"],
                "region": {"x": 0.2, "y": 0.2, "width": 0.5, "height": 0.4}
            },
            "Emphysema": {
                "color": "#FECA57",
                "description": "Hyperinflation of lungs with flattened diaphragm. Associated with COPD.",
                "recommendations": ["Pulmonary function tests", "Smoking cessation counseling", "Bronchodilator therapy"],
                "region": {"x": 0.15, "y": 0.35, "width": 0.5, "height": 0.3}
            },
            "Fibrosis": {
                "color": "#A29BFE",
                "description": "Interstitial scarring with reticular opacities. May indicate chronic lung disease.",
                "recommendations": ["Rheumatology consultation", "Pulmonary function monitoring", "Consider high-resolution CT"],
                "region": {"x": 0.2, "y": 0.2, "width": 0.4, "height": 0.4}
            },
            "Hernia": {
                "color": "#6C5CE7",
                "description": "Hiatal hernia visible as retrocardiac air-fluid level. Usually asymptomatic.",
                "recommendations": ["Gastroenterology consultation", "Dietary modifications", "Monitor for GERD symptoms"],
                "region": {"x": 0.35, "y": 0.4, "width": 0.25, "height": 0.2}
            },
            "Infiltration": {
                "color": "#A29BFE",
                "description": "Interstitial or alveolar opacities not fitting specific patterns.",
                "recommendations": ["Clinical correlation needed", "Monitor symptoms", "Consider follow-up imaging"],
                "region": {"x": 0.25, "y": 0.25, "width": 0.35, "height": 0.3}
            },
            "Mass": {
                "color": "#FD79A8",
                "description": "Well-defined opacity > 3cm. Requires further characterization and workup.",
                "recommendations": ["CT scan recommended", "Oncology consultation", "Biopsy consideration"],
                "region": {"x": 0.4, "y": 0.3, "width": 0.2, "height": 0.2}
            },
            "Nodule": {
                "color": "#E17055",
                "description": "Small round opacity < 3cm. Requires surveillance and follow-up.",
                "recommendations": ["CT follow-up in 3-6 months", "Monitor for growth", "Consider PET-CT if suspicious"],
                "region": {"x": 0.42, "y": 0.28, "width": 0.15, "height": 0.15}
            },
            "Pleural Effusion": {
                "color": "#00CEC9",
                "description": "Fluid collection in pleural space. Blunting of costophrenic angle.",
                "recommendations": ["Ultrasound for volume assessment", "Diuretic therapy if cardiac", "Consider thoracentesis"],
                "region": {"x": 0.5, "y": 0.58, "width": 0.3, "height": 0.25}
            },
            "Pneumonia": {
                "color": "#00B894",
                "description": "Lower-zone air-space opacity requiring clinical correlation.",
                "recommendations": ["Correlate with symptoms, temperature, and oxygen saturation", "Consider antibiotic therapy", "Follow-up chest X-ray in 48-72 hours"],
                "region": {"x": 0.35, "y": 0.35, "width": 0.25, "height": 0.25}
            },
            "Pneumothorax": {
                "color": "#00CEC9",
                "description": "Air in pleural space with visible visceral pleural line. May be spontaneous or traumatic.",
                "recommendations": ["Immediate clinical assessment", "Consider chest tube if large", "Monitor for re-expansion"],
                "region": {"x": 0.15, "y": 0.15, "width": 0.35, "height": 0.4}
            },
            "Tuberculosis Pattern": {
                "color": "#FDCB6E",
                "description": "Upper-zone chronic infection pattern. Requires further testing for confirmation.",
                "recommendations": ["Sputum testing for AFB", "Tuberculin skin test", "Infectious disease consultation"],
                "region": {"x": 0.25, "y": 0.15, "width": 0.35, "height": 0.3}
            }
        }

    def predict(self, age, gender, clinical_symptoms, clinical_history):
        text = f"{clinical_symptoms} {clinical_history}".lower()
        
        # COMPLETELY RANDOM: Base probabilities (2-35% range)
        probs = {d: random.uniform(2, 35) for d in self.diseases}
        
        #  Random symptom boosts (some symptoms may or may not affect diseases)
        # This makes it more realistic - not every symptom always triggers a disease
        symptom_boosts = {
            "fever": ["Pneumonia", "Consolidation", "Infiltration", "Tuberculosis Pattern"],
            "cough": ["Pneumonia", "Pleural Effusion", "Atelectasis", "Tuberculosis Pattern"],
            "shortness": ["Edema", "Pneumonia", "Pleural Effusion", "Emphysema", "Cardiomegaly"],
            "chest pain": ["Pneumothorax", "Pleural Effusion", "Pneumonia", "Mass"],
            "smoking": ["Emphysema", "Mass", "Nodule", "Fibrosis"],
            "weight loss": ["Tuberculosis Pattern", "Mass", "Fibrosis", "Pneumonia"],
            "night sweat": ["Tuberculosis Pattern", "Infiltration", "Pneumonia"],
            "sputum": ["Pneumonia", "Consolidation", "Tuberculosis Pattern", "Atelectasis"],
            "cough blood": ["Tuberculosis Pattern", "Mass", "Pneumonia", "Nodule"],
            "fatigue": ["Edema", "Cardiomegaly", "Pneumonia", "Fibrosis"],
            "wheezing": ["Emphysema", "Atelectasis", "Pneumonia"],
            "cyanosis": ["Edema", "Pneumonia", "Pleural Effusion", "Cardiomegaly"]
        }
        
        #  Randomly apply boosts with 60% chance per symptom-disease pair
        for symptom, diseases in symptom_boosts.items():
            if symptom in text:
                for disease in diseases:
                    if disease in probs and random.random() < 0.6:  # 60% chance to trigger
                        probs[disease] += random.uniform(5, 25)
        
        #  RANDOM AGE EFFECT (not deterministic - some people have different conditions)
        try:
            age_num = int(age)
            # Random chance of age-related conditions (70% chance)
            if age_num > 60 and random.random() < 0.7:
                # Randomly pick which age-related conditions appear
                age_conditions = ["Cardiomegaly", "Edema", "Emphysema", "Fibrosis", "Mass"]
                for disease in random.sample(age_conditions, random.randint(1, 3)):
                    if disease in probs:
                        probs[disease] += random.uniform(5, 20)
            
            # Younger patients (under 30) - random chance of different conditions
            elif age_num < 30 and random.random() < 0.7:
                young_conditions = ["Pneumonia", "Tuberculosis Pattern", "Pneumothorax", "Atelectasis"]
                for disease in random.sample(young_conditions, random.randint(1, 2)):
                    if disease in probs:
                        probs[disease] += random.uniform(5, 20)
        except:
            pass
        
        # GENDER EFFECTS (random chance, not deterministic)
        gender = gender.lower()
        if gender == "female" and random.random() < 0.5:
            # Randomly add female-specific conditions
            female_conditions = ["Cardiomegaly", "Mass"]
            for disease in random.sample(female_conditions, random.randint(0, 1)):
                if disease in probs:
                    probs[disease] += random.uniform(3, 15)
        elif gender == "male" and random.random() < 0.5:
            male_conditions = ["Emphysema", "Mass", "Nodule"]
            for disease in random.sample(male_conditions, random.randint(0, 1)):
                if disease in probs:
                    probs[disease] += random.uniform(3, 15)
        
        #  RANDOM NOISE: Add random variations to make results unique
        for disease in probs:
            probs[disease] += random.uniform(-3, 3)
        
        # Generate findings
        findings = []
        for name, prob in probs.items():
            prob = min(95, max(2, prob))
            if prob > 15:
                info = self.diseases[name]
                region = info["region"]
                
                # 🎲 RANDOM BOUNDING BOX VARIATION
                prob_factor = prob / 100
                # More random variation in box size
                size_variation = random.uniform(0.6, 1.0)
                width = region["width"] * (0.6 + 0.4 * prob_factor) * size_variation
                height = region["height"] * (0.6 + 0.4 * prob_factor) * size_variation
                
                # Random position jitter
                jitter = random.uniform(-0.03, 0.03)
                x = max(0, min(1 - width, region["x"] + jitter))
                y = max(0, min(1 - height, region["y"] + jitter))
                
                findings.append({
                    "name": name,
                    "probability": round(prob),
                    "color": info["color"],
                    "description": info["description"],
                    "recommendations": info["recommendations"],
                    "boundingBox": {
                        "x": round(x * 512),
                        "y": round(y * 512),
                        "width": round(width * 512),
                        "height": round(height * 512),
                        "color": info["color"]
                    }
                })
        
        # Sort by probability (highest first)
        findings.sort(key=lambda x: x["probability"], reverse=True)
        
        # 🎲 Random number of findings (3-8)
        max_findings = random.randint(3, 8)
        findings = findings[:max_findings]
        
        # Calculate priority based on highest probability
        max_prob = max([f["probability"] for f in findings]) if findings else 0
        priority = "high" if max_prob >= 85 else "medium" if max_prob >= 65 else "low"
        
        return {
            "findings": findings,
            "priority": priority,
            "totalDetected": len(findings),
            "maxProbability": max_prob
        }

def main():
    try:
        data = json.loads(sys.stdin.read())
        model = CheXNet14()
        result = model.predict(
            age=data.get('age'),
            gender=data.get('gender'),
            clinical_symptoms=data.get('clinicalSymptoms', ''),
            clinical_history=data.get('clinicalHistory', '')
        )
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()