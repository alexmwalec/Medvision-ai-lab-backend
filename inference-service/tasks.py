import os
import base64
import cv2
import numpy as np
import torch
from celery import Celery
from celery.exceptions import MaxRetriesExceededError
from torchvision import transforms

from database import SessionLocal, AnalysisJob, JobStatus
from gradcam import overlay_heatmap, extract_bounding_box
from image_io import decode_uploaded_image
from model_loader import model_bundle

# Initialize AI model resources
LABELS = model_bundle.labels
NUM_CLASSES = len(LABELS)
DEVICE = model_bundle.device
model = model_bundle.model
gradcam = model_bundle.gradcam

preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# Celery Configuration
redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery("medvision_tasks", broker=redis_url, backend=redis_url)

celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={'tasks.process_analysis_task': {'queue': 'main_queue'}}
)

@celery_app.task(bind=True, max_retries=5, queue='main_queue')
def process_analysis_task(self, job_id, image_bytes_b64, threshold, explain_top_n):
    db = SessionLocal()
    try:
        job = db.query(AnalysisJob).filter(AnalysisJob.id == job_id).first()
        if not job: return

        job.status = JobStatus.PROCESSING
        db.commit()

        # Core logic
        raw_bytes = base64.b64decode(image_bytes_b64)
        decoded = decode_uploaded_image(raw_bytes)
        pil_img = decoded.image
        
        input_tensor = preprocess(pil_img).unsqueeze(0).to(DEVICE)
        display_img_bgr = cv2.cvtColor(np.array(pil_img.resize((224, 224))), cv2.COLOR_RGB2BGR)

        with torch.no_grad():
            probs = torch.sigmoid(model(input_tensor))[0].cpu().numpy()

        findings = [
            {"disease": LABELS[i], "score": float(probs[i]), "positive": bool(probs[i] >= threshold)}
            for i in range(NUM_CLASSES)
        ]
        findings.sort(key=lambda f: f["score"], reverse=True)

        explanations = []
        top_positive = [f for f in findings if f["positive"]][:explain_top_n]
        for f in top_positive:
            class_idx = LABELS.index(f["disease"])
            cam, _ = gradcam.generate(input_tensor, class_idx)
            overlay_b64 = base64.b64encode(cv2.imencode(".png", overlay_heatmap(cam, display_img_bgr))[1]).decode("utf-8")
            explanations.append({
                "disease": f["disease"], "score": f["score"],
                "heatmap_png_base64": overlay_b64, "bounding_box": extract_bounding_box(cam)
            })

        job.findings = {
            "findings": findings, "explanations": explanations,
            "source_format": decoded.source_format, "dicom": decoded.dicom_metadata
        }
        job.status = JobStatus.COMPLETED
        db.commit()
    except Exception as exc:
        db.rollback()
        try:
            raise self.retry(exc=exc, countdown=2 ** self.request.retries * 30)
        except MaxRetriesExceededError:
            job.status = JobStatus.FAILED
            job.error_message = str(exc)
            db.commit()
    finally:
        db.close()
