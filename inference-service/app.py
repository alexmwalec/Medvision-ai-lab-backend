import base64
import io

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, Query
from fastapi.responses import JSONResponse
from PIL import Image
from torchvision import transforms

from gradcam import overlay_heatmap, extract_bounding_box
from model_loader import model_bundle

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

app = FastAPI(title="MedVision AI Inference Service")


@app.get("/health")
def health():
    return {"status": "ok", "device": str(DEVICE)}


@app.post("/predict")
async def predict(
    file: UploadFile = File(...),
    threshold: float = Query(0.5, description="Score above which a disease counts as 'positive'"),
    explain_top_n: int = Query(1, description="Generate Grad-CAM for the top N positive findings"),
):
    # --- Load + preprocess image ---
    raw_bytes = await file.read()
    pil_img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
    input_tensor = preprocess(pil_img).unsqueeze(0).to(DEVICE)

    # Keep a resized BGR copy of the original for heatmap overlay
    display_img = np.array(pil_img.resize((224, 224)))
    display_img_bgr = cv2.cvtColor(display_img, cv2.COLOR_RGB2BGR)

    # --- Predictions branch ---
    with torch.no_grad():
        logits = model(input_tensor)
        probs = torch.sigmoid(logits)[0].cpu().numpy()

    findings = [
        {"disease": LABELS[i], "score": float(probs[i]), "positive": bool(probs[i] >= threshold)}
        for i in range(NUM_CLASSES)
    ]
    findings.sort(key=lambda f: f["score"], reverse=True)

    # --- Grad-CAM branch: explain the top N positive findings ---
    top_positive = [f for f in findings if f["positive"]][:explain_top_n]
    explanations = []
    for f in top_positive:
        class_idx = LABELS.index(f["disease"])
        cam, score_check = gradcam.generate(input_tensor, class_idx)
        overlay = overlay_heatmap(cam, display_img_bgr)
        bbox = extract_bounding_box(cam)
        _, buf = cv2.imencode(".png", overlay)
        overlay_b64 = base64.b64encode(buf).decode("utf-8")
        explanations.append({
            "disease": f["disease"],
            "score": f["score"],
            "heatmap_png_base64": overlay_b64,
            "bounding_box": bbox,  # {x, y, width, height} normalized 0-1, or None
        })

    return JSONResponse({
        "findings": findings,
        "explanations": explanations,
    })