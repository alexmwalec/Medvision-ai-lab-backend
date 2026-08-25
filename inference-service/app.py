import uuid
from fastapi import FastAPI, File, HTTPException, UploadFile, Query, Header, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import base64

from database import SessionLocal, AnalysisJob, JobStatus, init_db
from tasks import celery_app, process_analysis_task

app = FastAPI(title="MedVision AI Enterprise Service")

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
    try:
        db = SessionLocal()
        db.execute("SELECT 1")
        db.close()
        celery_app.control.ping()
        return {"status": "ready"}
    except Exception:
        raise HTTPException(status_code=503, detail="Service dependencies not ready")

@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    threshold: float = Query(0.5),
    explain_top_n: int = Query(1),
    idempotency_key: str = Header(None, alias="X-Idempotency-Key"),
    db: Session = Depends(get_db)
):
    key = idempotency_key or str(uuid.uuid4())
    
    existing = db.query(AnalysisJob).filter(AnalysisJob.idempotency_key == key).first()
    if existing:
        return {"job_id": existing.id, "status": existing.status.value, "findings": existing.findings}

    job_id = str(uuid.uuid4())
    job = AnalysisJob(id=job_id, idempotency_key=key, status=JobStatus.PENDING)
    
    try:
        db.add(job)
        db.commit()
        
        img_b64 = base64.b64encode(await file.read()).decode("utf-8")
        process_analysis_task.delay(job_id, img_b64, threshold, explain_top_n)
        return {"job_id": job_id, "status": "pending"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status/{job_id}")
async def get_status(job_id: str, db: Session = Depends(get_db)):
    job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
    if not job: raise HTTPException(status_code=404, detail="Job not found")
    return {"job_id": job.id, "status": job.status.value, "findings": job.findings, "error": job.error_message}
