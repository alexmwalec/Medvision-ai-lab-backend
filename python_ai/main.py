from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import cloudinary
import cloudinary.uploader
import os
from dotenv import load_dotenv

load_dotenv()

# Configuring Cloudinary for backend
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True
)

app = FastAPI()

class AnalysisRequest(BaseModel):
    imageUrl: str
    publicId: Optional[str] = None
    name: str
    patientId: Optional[str] = None
    age: str
    gender: str
    date: str
    scanType: str
    clinicalSymptoms: Optional[str] = None
    clinicalHistory: Optional[str] = None
    imageMetadata: Optional[dict] = None

@app.post("/api/analyze")
async def analyze_image(request: AnalysisRequest):
    try:
        return {
            "success": True,
            "patient": {
                "id": request.patientId or request.publicId,
                "name": request.name,
                "age": request.age,
                "gender": request.gender,
                "scan_date": request.date
            },
            "aiFindings": [
                {"finding": "Normal chest X-ray", "confidence": 0.95},
                {"finding": "No acute abnormalities detected", "confidence": 0.92}
            ],
            "heatmapUrl": f"https://res.cloudinary.com/snhw1oq8/image/upload/w_500,h_500,c_fill/{request.publicId}" if request.publicId else None,
            "imageUrl": request.imageUrl
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/delete-image")
async def delete_image(publicId: str):
    try:
        result = cloudinary.uploader.destroy(publicId)
        return {"success": True, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))