import os

import torch
import torch.nn as nn
from torchvision import models

from gradcam import GradCAM

LABELS = [
    "Atelectasis", "Cardiomegaly", "Effusion", "Infiltration", "Mass",
    "Nodule", "Pneumonia", "Pneumothorax", "Consolidation", "Edema",
    "Emphysema", "Fibrosis", "Pleural_Thickening", "Hernia",
]
NUM_CLASSES = len(LABELS)

DEFAULT_CHECKPOINT_PATH = os.environ.get("MODEL_PATH", "models/finetune_best.pt")


class ModelBundle:
    """Holds the model, its device, and its Grad-CAM hook together so
    app.py only needs one import to get everything it needs."""

    def __init__(self, checkpoint_path: str = DEFAULT_CHECKPOINT_PATH):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.labels = LABELS
        self.model = self._build_and_load(checkpoint_path)
        self.gradcam = GradCAM(self.model)

    def _build_and_load(self, checkpoint_path: str) -> nn.Module:
        if not os.path.exists(checkpoint_path):
            raise FileNotFoundError(
                f"Checkpoint not found at '{checkpoint_path}'. "
                f"Set MODEL_PATH env var or place finetune_best.pt at that path."
            )

        model = models.densenet121(weights=None)
        in_features = model.classifier.in_features
        model.classifier = nn.Linear(in_features, NUM_CLASSES)

        ckpt = torch.load(checkpoint_path, map_location=self.device)
        state_dict = ckpt["model_state"] if isinstance(ckpt, dict) and "model_state" in ckpt else ckpt
        model.load_state_dict(state_dict)

        model.to(self.device)
        model.eval()
        return model


model_bundle = ModelBundle()