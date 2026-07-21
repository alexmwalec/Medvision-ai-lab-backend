from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import cloudinary
import cloudinary.uploader
import os
from datetime import datetime
import uuid


class Patient(BaseModel):
    id: Optional[str] = None
    name: str
    patientId: Optional[str] = None
    age: str
    gender: str
    date: str
    scanType: str
    clinicalSymptoms: Optional[str] = None
    clinicalHistory: Optional[str] = None
    imageUrl: Optional[str] = None
    publicId: Optional[str] = None
    priority: str = "medium"  # critical, high, medium, low
    status: str = "pending"   # pending, reviewed, consulting
    aiFindings: List[dict] = []
    createdAt: Optional[str] = None

class ReviewRequest(BaseModel):
    patientId: str
    requestedAt: str

class PriorityUpdate(BaseModel):
    priority: str

class StatusUpdate(BaseModel):
    status: str

# ============ IN-MEMORY DATABASE ============
# In production, use a real database like PostgreSQL or MongoDB

patients_db = {}

# ============ ENDPOINTS ============

@app.get("/api/patients")
async def get_all_patients():
    """Get all patients"""
    try:
        # Convert dict to list
        patient_list = list(patients_db.values())
        # Sort by date (newest first)
        patient_list.sort(key=lambda x: x.get('date', ''), reverse=True)
        return patient_list
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str):
    """Get a specific patient by ID"""
    try:
        patient = patients_db.get(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        return patient
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/patients")
async def create_patient(patient: Patient):
    """Create a new patient"""
    try:
        # Generate ID if not provided
        if not patient.id:
            patient.id = str(uuid.uuid4())[:8]
        
        # Add creation timestamp
        patient.createdAt = datetime.now().isoformat()
        
        # Ensure aiFindings is a list
        if not patient.aiFindings:
            patient.aiFindings = []
        
        # Store patient
        patients_db[patient.id] = patient.dict()
        
        return patients_db[patient.id]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/patients/{patient_id}/request-review")
async def request_review(patient_id: str, request: ReviewRequest):
    """Request radiologist review for a patient"""
    try:
        patient = patients_db.get(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Update patient status
        patient['status'] = 'consulting'
        patient['reviewRequestedAt'] = request.requestedAt
        
        # Update in database
        patients_db[patient_id] = patient
        
        return {
            "success": True,
            "message": "Review requested successfully",
            "patient": patient
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/patients/{patient_id}/priority")
async def update_priority(patient_id: str, update: PriorityUpdate):
    """Update patient priority"""
    try:
        patient = patients_db.get(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Validate priority
        valid_priorities = ['critical', 'high', 'medium', 'low']
        if update.priority.lower() not in valid_priorities:
            raise HTTPException(status_code=400, detail="Invalid priority")
        
        patient['priority'] = update.priority.lower()
        patients_db[patient_id] = patient
        
        return {
            "success": True,
            "message": "Priority updated successfully",
            "patient": patient
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/patients/{patient_id}/status")
async def update_status(patient_id: str, update: StatusUpdate):
    """Update patient status"""
    try:
        patient = patients_db.get(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        
        # Validate status
        valid_statuses = ['pending', 'reviewed', 'consulting', 'completed']
        if update.status.lower() not in valid_statuses:
            raise HTTPException(status_code=400, detail="Invalid status")
        
        patient['status'] = update.status.lower()
        patients_db[patient_id] = patient
        
        return {
            "success": True,
            "message": "Status updated successfully",
            "patient": patient
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/patients/stats")
async def get_stats():
    """Get patient statistics"""
    try:
        total = len(patients_db)
        urgent = sum(1 for p in patients_db.values() if p.get('priority') in ['critical', 'high'])
        reviewed = sum(1 for p in patients_db.values() if p.get('status') == 'reviewed')
        consulting = sum(1 for p in patients_db.values() if p.get('status') == 'consulting')
        
        return {
            "total": total,
            "urgent": urgent,
            "reviewed": reviewed,
            "consulting": consulting,
            "pending": total - reviewed - consulting
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/analyze")
async def analyze_image(data: dict):
    """Analyze a chest X-ray image"""
    try:
        # Mock analysis response
        # In production, call your AI model here
        mock_findings = [
            {"name": "Normal", "description": "No abnormalities detected", "probability": 85, "color": "#10B981"},
            {"name": "Clear lungs", "description": "No opacity detected", "probability": 90, "color": "#3B82F6"}
        ]
        
        # Create a patient record
        patient_data = {
            "id": data.get('patientId') or str(uuid.uuid4())[:8],
            "name": data.get('name'),
            "age": data.get('age'),
            "gender": data.get('gender'),
            "date": data.get('date'),
            "scanType": data.get('scanType'),
            "clinicalSymptoms": data.get('clinicalSymptoms', ''),
            "clinicalHistory": data.get('clinicalHistory', ''),
            "imageUrl": data.get('imageUrl'),
            "publicId": data.get('publicId'),
            "priority": "medium",
            "status": "pending",
            "aiFindings": mock_findings,
            "createdAt": datetime.now().isoformat()
        }
        
        # Save patient
        patient_id = patient_data['id']
        patients_db[patient_id] = patient_data
        
        return {
            "success": True,
            "patient": patient_data,
            "aiFindings": mock_findings,
            "heatmapUrl": data.get('imageUrl'),  
            "id": patient_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))