import uuid
from fastapi import (
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    Query,
    Header,
    Depends,
    Form,
)

from fastapi.responses import JSONResponse

import base64

from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session
from database import SessionLocal, AnalysisJob, JobStatus, init_db
from tasks import celery_app, process_analysis_task

app = FastAPI(title="MedVision AI Enterprise Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database tables
init_db()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/health")
def liveness():
    return {"status": "ok"}

@app.get("/ready")
def readiness():
    db_ok = False
    redis_ok = False

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        db_ok = True
    except Exception as e:
        print(f"MySQL readiness failed: {type(e).__name__}: {e}")

    try:
        result = celery_app.control.ping(timeout=2.0)
        redis_ok = bool(result)
        print(f"Celery ping result: {result}")
    except Exception as e:
        print(f"Celery readiness failed: {type(e).__name__}: {e}")

    if not db_ok or not redis_ok:
        raise HTTPException(
            status_code=503,
            detail={
                "mysql": db_ok,
                "celery": redis_ok,
            },
        )

    return {
        "status": "ready",
        "mysql": True,
        "celery": True,
    }

@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    externalPatientId: str = Form(...),
    patientName: str = Form(...),
    age: int = Form(...),
    gender: str = Form(...),
    scanDate: str = Form(...),
    scanType: str = Form(...),
    clinicalSymptoms: str = Form(""),
    clinicalHistory: str = Form(""),
    threshold: float = Query(0.5),
    explain_top_n: int = Query(1),
    idempotency_key: str = Header(None, alias="X-Idempotency-Key"),
    db: Session = Depends(get_db)
):
    key = idempotency_key or str(uuid.uuid4())

    existing = (
        db.query(AnalysisJob)
        .filter(AnalysisJob.idempotency_key == key)
        .first()
    )

    if existing:
        return {
            "job_id": existing.id,
            "status": existing.status.value,
            "findings": existing.findings,
        }

    job_id = str(uuid.uuid4())

    job = AnalysisJob(
        id=job_id,
        idempotency_key=key,
        status=JobStatus.PENDING,
    )

    try:
        db.add(job)
        db.commit()

        image_bytes = await file.read()
        img_b64 = base64.b64encode(image_bytes).decode("utf-8")

        process_analysis_task.delay(
            job_id,
            img_b64,
            threshold,
            explain_top_n,
        )

        return {
            "job_id": job_id,
            "status": "pending",
            "patient": {
                "id": externalPatientId,
                "patientId": externalPatientId,
                "name": patientName,
                "age": age,
                "gender": gender,
                "date": scanDate,
                "scanType": scanType,
                "clinicalSymptoms": clinicalSymptoms,
                "clinicalHistory": clinicalHistory,
            },
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status/{job_id}")
async def get_status(job_id: str, db: Session = Depends(get_db)):
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job: raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job.id, "status": job.status.value, "findings": job.findings, "error": job.error_message}
