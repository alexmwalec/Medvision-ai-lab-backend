import os
import base64
import cv2
import numpy as np
import torch
import logging
import time

from celery import Celery
from celery.exceptions import MaxRetriesExceededError
from torchvision import transforms

from database import SessionLocal, AnalysisJob, JobStatus
from gradcam import overlay_heatmap, extract_bounding_box
from image_io import decode_uploaded_image
from model_loader import model_bundle


# ---------------------------------------------------------
# Logging
# ---------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(processName)s | %(message)s",
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------
# Model resources
# ---------------------------------------------------------

LABELS = model_bundle.labels
NUM_CLASSES = len(LABELS)
DEVICE = model_bundle.device
model = model_bundle.model
gradcam = model_bundle.gradcam


# ---------------------------------------------------------
# Preprocessing
# ---------------------------------------------------------

preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225],
    ),
])


# ---------------------------------------------------------
# Celery
# ---------------------------------------------------------

redis_url = os.getenv(
    "REDIS_URL",
    "redis://localhost:6379/0",
)

celery_app = Celery(
    "medvision_tasks",
    broker=redis_url,
    backend=redis_url,
)

celery_app.conf.update(
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_routes={
        "tasks.process_analysis_task": {
            "queue": "main_queue"
        }
    },
)


# ---------------------------------------------------------
# Task
# ---------------------------------------------------------

@celery_app.task(
    bind=True,
    max_retries=5,
    queue="main_queue",
    soft_time_limit=300,
    time_limit=360,
)
def process_analysis_task(
    self,
    job_id,
    image_bytes_b64,
    threshold,
    explain_top_n,
):
    started = time.perf_counter()
    db = SessionLocal()

    logger.info("[%s] TASK START", job_id)

    try:

        # -------------------------------------------------
        # 1. Load job
        # -------------------------------------------------

        logger.info("[%s] Loading AnalysisJob", job_id)

        job = (
            db.query(AnalysisJob)
            .filter(AnalysisJob.id == job_id)
            .first()
        )

        if not job:
            logger.error(
                "[%s] JOB NOT FOUND",
                job_id,
            )
            return

        logger.info(
            "[%s] Job found, current status=%s",
            job_id,
            job.status,
        )

        # -------------------------------------------------
        # 2. Mark processing
        # -------------------------------------------------

        job.status = JobStatus.PROCESSING
        db.commit()

        logger.info(
            "[%s] STATUS -> PROCESSING",
            job_id,
        )

        # -------------------------------------------------
        # 3. Base64 decode
        # -------------------------------------------------

        stage_start = time.perf_counter()

        logger.info(
            "[%s] START base64 decode",
            job_id,
        )

        raw_bytes = base64.b64decode(
            image_bytes_b64
        )

        logger.info(
            "[%s] END base64 decode: %d bytes, %.4fs",
            job_id,
            len(raw_bytes),
            time.perf_counter() - stage_start,
        )

        # -------------------------------------------------
        # 4. Image / DICOM decoding
        # -------------------------------------------------

        stage_start = time.perf_counter()

        logger.info(
            "[%s] START image decoding",
            job_id,
        )

        decoded = decode_uploaded_image(
            raw_bytes
        )

        logger.info(
            "[%s] END image decoding: "
            "format=%s size=%s time=%.4fs",
            job_id,
            decoded.source_format,
            decoded.image.size,
            time.perf_counter() - stage_start,
        )

        pil_img = decoded.image

        # -------------------------------------------------
        # 5. Preprocessing
        # -------------------------------------------------

        logger.info(
            "[%s] DEVICE=%s",
            job_id,
            DEVICE,
        )

        logger.info(
            "[%s] CUDA available=%s",
            job_id,
            torch.cuda.is_available(),
        )

        stage_start = time.perf_counter()

        logger.info(
            "[%s] START preprocessing",
            job_id,
        )

        # Resize
        resize_start = time.perf_counter()

        logger.info(
            "[%s] START Resize",
            job_id,
        )

        resized_img = pil_img.resize(
            (224, 224)
        )

        logger.info(
            "[%s] END Resize: size=%s time=%.4fs",
            job_id,
            resized_img.size,
            time.perf_counter() - resize_start,
        )

        # ToTensor
        tensor_start = time.perf_counter()

        logger.info(
            "[%s] START ToTensor",
            job_id,
        )

        tensor_img = transforms.ToTensor()(
            resized_img
        )

        logger.info(
            "[%s] END ToTensor: shape=%s "
            "dtype=%s time=%.4fs",
            job_id,
            tuple(tensor_img.shape),
            tensor_img.dtype,
            time.perf_counter() - tensor_start,
        )

        # Normalize
        normalize_start = time.perf_counter()

        logger.info(
            "[%s] START Normalize",
            job_id,
        )

        tensor_img = transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        )(tensor_img)

        logger.info(
            "[%s] END Normalize time=%.4fs",
            job_id,
            time.perf_counter() - normalize_start,
        )

        # Unsqueeze
        logger.info(
            "[%s] START unsqueeze",
            job_id,
        )

        input_tensor = tensor_img.unsqueeze(0)

        logger.info(
            "[%s] END unsqueeze: shape=%s",
            job_id,
            tuple(input_tensor.shape),
        )

        # Device transfer
        device_start = time.perf_counter()

        logger.info(
            "[%s] START move to device: %s",
            job_id,
            DEVICE,
        )

        input_tensor = input_tensor.to(DEVICE)

        logger.info(
            "[%s] END move to device: %s time=%.4fs",
            job_id,
            DEVICE,
            time.perf_counter() - device_start,
        )

        logger.info(
            "[%s] END preprocessing total=%.4fs",
            job_id,
            time.perf_counter() - stage_start,
        )

        # Display image
        display_img_bgr = cv2.cvtColor(
            np.array(
                pil_img.resize((224, 224))
            ),
            cv2.COLOR_RGB2BGR,
        )

        # -------------------------------------------------
        # 6. Model inference
        # -------------------------------------------------

        stage_start = time.perf_counter()

        logger.info(
            "[%s] START model inference",
            job_id,
        )

        with torch.no_grad():

            model_start = time.perf_counter()

            model_output = model(
                input_tensor
            )

            logger.info(
                "[%s] Model forward complete time=%.4fs",
                job_id,
                time.perf_counter() - model_start,
            )

            probs = torch.sigmoid(
                model_output
            )[0].cpu().numpy()

        logger.info(
            "[%s] END model inference total=%.4fs",
            job_id,
            time.perf_counter() - stage_start,
        )

        # -------------------------------------------------
        # 7. Findings
        # -------------------------------------------------

        findings = [
            {
                "disease": LABELS[i],
                "score": float(probs[i]),
                "positive": bool(
                    probs[i] >= threshold
                ),
            }
            for i in range(NUM_CLASSES)
        ]

        findings.sort(
            key=lambda f: f["score"],
            reverse=True,
        )

        logger.info(
            "[%s] Findings generated: count=%d",
            job_id,
            len(findings),
        )

        logger.info(
            "[%s] Top finding=%s score=%.4f",
            job_id,
            findings[0]["disease"],
            findings[0]["score"],
        )

        # -------------------------------------------------
        # 8. Grad-CAM
        # -------------------------------------------------

        explanations = []

        top_positive = [
            finding
            for finding in findings
            if finding["positive"]
        ][:explain_top_n]

        logger.info(
            "[%s] Positive findings for explanation=%d",
            job_id,
            len(top_positive),
        )

        for finding in top_positive:

            logger.info(
                "[%s] START Grad-CAM disease=%s",
                job_id,
                finding["disease"],
            )

            stage_start = time.perf_counter()

            class_idx = LABELS.index(
                finding["disease"]
            )

            cam, cam_score = gradcam.generate(
                input_tensor,
                class_idx,
            )

            logger.info(
                "[%s] END Grad-CAM disease=%s "
                "time=%.4fs score=%.4f",
                job_id,
                finding["disease"],
                time.perf_counter() - stage_start,
                cam_score,
            )

            # Heatmap encoding
            stage_start = time.perf_counter()

            logger.info(
                "[%s] START heatmap encoding disease=%s",
                job_id,
                finding["disease"],
            )

            overlaid = overlay_heatmap(
                cam,
                display_img_bgr,
            )

            success, encoded = cv2.imencode(
                ".png",
                overlaid,
            )

            if not success:
                raise RuntimeError(
                    "Failed to encode Grad-CAM overlay"
                )

            overlay_b64 = base64.b64encode(
                encoded
            ).decode("utf-8")

            logger.info(
                "[%s] END heatmap encoding disease=%s "
                "time=%.4fs",
                job_id,
                finding["disease"],
                time.perf_counter() - stage_start,
            )

            bounding_box = extract_bounding_box(
                cam
            )

            explanations.append(
                {
                    "disease": finding["disease"],
                    "score": finding["score"],
                    "heatmap_png_base64": overlay_b64,
                    "bounding_box": bounding_box,
                }
            )

        logger.info(
            "[%s] Explanations completed count=%d",
            job_id,
            len(explanations),
        )

        # -------------------------------------------------
        # 9. Save final result
        # -------------------------------------------------

        logger.info(
            "[%s] Preparing final result",
            job_id,
        )

        job.findings = {
            "findings": findings,
            "explanations": explanations,
            "source_format": decoded.source_format,
            "dicom": decoded.dicom_metadata,
        }

        logger.info(
            "[%s] START database commit",
            job_id,
        )

        job.status = JobStatus.COMPLETED

        db.commit()

        logger.info(
            "[%s] END database commit",
            job_id,
        )

        logger.info(
            "[%s] TASK COMPLETED SUCCESSFULLY "
            "total_time=%.4fs",
            job_id,
            time.perf_counter() - started,
        )

    except Exception as exc:

        logger.exception(
            "[%s] TASK FAILED: %s",
            job_id,
            exc,
        )

        db.rollback()

        try:

            retry_countdown = (
                2 ** self.request.retries
            ) * 30

            logger.warning(
                "[%s] RETRYING attempt=%d/%d "
                "countdown=%ds",
                job_id,
                self.request.retries + 1,
                self.max_retries,
                retry_countdown,
            )

            raise self.retry(
                exc=exc,
                countdown=retry_countdown,
            )

        except MaxRetriesExceededError:

            logger.error(
                "[%s] MAX RETRIES EXCEEDED",
                job_id,
            )

            try:
                job.status = JobStatus.FAILED
                job.error_message = str(exc)
                db.commit()
            except Exception:
                logger.exception(
                    "[%s] Failed to save FAILED status",
                    job_id,
                )

    finally:

        db.close()

        logger.info(
            "[%s] DB SESSION CLOSED",
            job_id,
        )