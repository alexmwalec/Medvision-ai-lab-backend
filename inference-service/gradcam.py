import cv2
import numpy as np
import torch
import torch.nn.functional as F


class GradCAM:
    def __init__(self, model, target_layer=None):
        self.model = model
        self.model.eval()
        # (output shape ~ [B, 1024, 7, 7] for 224x224 input)
        self.target_layer = target_layer if target_layer is not None else model.features

        self.activations = None
        self.gradients = None

        self.target_layer.register_forward_hook(self._save_activation)
        self.target_layer.register_full_backward_hook(self._save_gradient)

    def _save_activation(self, module, input, output):
        self.activations = output.detach()

    def _save_gradient(self, module, grad_input, grad_output):
        self.gradients = grad_output[0].detach()

    def generate(self, input_tensor, class_idx):
        """
        input_tensor: [1, 3, 224, 224], already normalized, on same device as model
        class_idx: int, which of the 14 disease logits to explain
        Returns: cam as a [224, 224] numpy array, values in [0, 1]
        """
        self.model.zero_grad()
        output = self.model(input_tensor)  # [1, 14] raw logits
        score = output[0, class_idx]
        score.backward(retain_graph=True)

        weights = self.gradients.mean(dim=(2, 3), keepdim=True)  # [1, C, 1, 1]
        cam = (weights * self.activations).sum(dim=1, keepdim=True)  # [1, 1, H, W]
        cam = F.relu(cam)

        cam = cam.squeeze().cpu().numpy()
        cam = cv2.resize(cam, (224, 224))
        cam = cam - cam.min()
        cam = cam / (cam.max() + 1e-8)
        return cam, float(torch.sigmoid(score).item())


def overlay_heatmap(cam, original_image_bgr, alpha=0.4):
    """
    cam: [224, 224] float array in [0, 1]
    original_image_bgr: [224, 224, 3] uint8, BGR (OpenCV convention)
    Returns: [224, 224, 3] uint8 BGR image with heatmap overlaid
    """
    heatmap = cv2.applyColorMap(np.uint8(255 * cam), cv2.COLORMAP_JET)
    overlaid = cv2.addWeighted(heatmap, alpha, original_image_bgr, 1 - alpha, 0)
    return overlaid