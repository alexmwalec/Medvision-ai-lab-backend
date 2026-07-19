#!/usr/bin/env python3
import cv2
import numpy as np
from PIL import Image
import io
import base64
import json
import random

class VisionProcessor:
    def __init__(self):
        self.image_size = (512, 512)
        
    def process_image(self, image_bytes):
        """Process uploaded image and extract features"""
        # Convert bytes to image
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise ValueError("Could not decode image")
        
        # Convert to grayscale for analysis
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Resize for consistency
        resized = cv2.resize(img, self.image_size)
        gray_resized = cv2.resize(gray, self.image_size)
        
        return {
            'original': img,
            'gray': gray,
            'resized': resized,
            'gray_resized': gray_resized,
            'shape': img.shape
        }
    
    def detect_lung_regions(self, image):
        """Detect lung regions using thresholding and contour detection"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Apply Gaussian blur to reduce noise
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        
        # Use Otsu's thresholding
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Find contours
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter contours by area
        lung_contours = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 10000:  # Minimum area threshold
                lung_contours.append(contour)
        
        return lung_contours
    
    def generate_heatmap(self, image, regions):
        """Generate heatmap overlay showing areas of interest"""
        heatmap = np.zeros_like(image, dtype=np.float32)
        
        for region in regions:
            x, y, w, h = region
            # Create a Gaussian heat spot
            center_x = x + w // 2
            center_y = y + h // 2
            sigma = max(w, h) // 4
            
            for i in range(max(0, y - sigma), min(image.shape[0], y + h + sigma)):
                for j in range(max(0, x - sigma), min(image.shape[1], x + w + sigma)):
                    distance = np.sqrt((i - center_y)**2 + (j - center_x)**2)
                    value = np.exp(-distance**2 / (2 * sigma**2))
                    heatmap[i, j] = max(heatmap[i, j], value)
        
        # Normalize heatmap
        if np.max(heatmap) > 0:
            heatmap = heatmap / np.max(heatmap)
        
        # Create colored heatmap
        heatmap_colored = cv2.applyColorMap((heatmap * 255).astype(np.uint8), cv2.COLORMAP_JET)
        
        # Overlay on original image
        overlay = cv2.addWeighted(image, 0.6, heatmap_colored, 0.4, 0)
        
        return overlay, heatmap
    
    def detect_abnormalities(self, image, lung_contours):
        """Simulate detection of abnormalities in lung regions"""
        abnormalities = []
        
        if not lung_contours:
            return abnormalities
        
        # Use the largest lung contour
        lung_contour = max(lung_contours, key=cv2.contourArea)
        x, y, w, h = cv2.boundingRect(lung_contour)
        
        # Simulate finding abnormalities in lung regions
        # These would be replaced with actual ML model predictions
        
        # Define regions for different conditions
        regions = {
            "Pneumonia": (x + w//4, y + h//4, w//2, h//2),
            "Pleural Effusion": (x + w//2, y + h//2, w//3, h//3),
            "Tuberculosis Pattern": (x + w//3, y + h//6, w//3, h//3),
            "Nodule": (x + w//2, y + h//3, w//6, h//6),
            "Cardiomegaly": (x + w//3, y + h//3, w//2, h//2)
        }
        
        # Randomly select 2-4 conditions
        selected_conditions = random.sample(list(regions.keys()), random.randint(2, 4))
        
        for condition in selected_conditions:
            rx, ry, rw, rh = regions[condition]
            # Add some randomness
            jitter = 0.1
            rx = int(rx + random.uniform(-jitter * rw, jitter * rw))
            ry = int(ry + random.uniform(-jitter * rh, jitter * rh))
            rw = int(rw * random.uniform(0.7, 1.3))
            rh = int(rh * random.uniform(0.7, 1.3))
            
            # Ensure within bounds
            rx = max(x, min(x + w - rw, rx))
            ry = max(y, min(y + h - rh, ry))
            
            abnormalities.append({
                'condition': condition,
                'bbox': [rx, ry, rw, rh],
                'confidence': random.uniform(0.6, 0.95)
            })
        
        return abnormalities
    
    def draw_bounding_boxes(self, image, abnormalities):
        """Draw bounding boxes on the image"""
        img_copy = image.copy()
        
        colors = {
            "Pneumonia": (0, 255, 0),
            "Pleural Effusion": (0, 255, 255),
            "Tuberculosis Pattern": (255, 0, 255),
            "Nodule": (255, 0, 0),
            "Cardiomegaly": (0, 0, 255)
        }
        
        for ab in abnormalities:
            x, y, w, h = ab['bbox']
            color = colors.get(ab['condition'], (255, 255, 255))
            
            # Draw rectangle
            cv2.rectangle(img_copy, (x, y), (x + w, y + h), color, 2)
            
            # Draw label
            label = f"{ab['condition']}: {ab['confidence']:.2f}"
            cv2.putText(img_copy, label, (x, y - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        return img_copy

    def analyze_image(self, image_bytes):
        """Full pipeline: process, detect, and analyze image"""
        # Process image
        processed = self.process_image(image_bytes)
        img = processed['resized']
        
        # Detect lung regions
        lung_contours = self.detect_lung_regions(img)
        
        # Detect abnormalities
        abnormalities = self.detect_abnormalities(img, lung_contours)
        
        # Generate heatmap
        if abnormalities:
            regions = [ab['bbox'] for ab in abnormalities]
            heatmap_overlay, heatmap = self.generate_heatmap(img, regions)
        else:
            heatmap_overlay = img
            heatmap = np.zeros((img.shape[0], img.shape[1]), dtype=np.float32)
        
        # Draw bounding boxes
        annotated_img = self.draw_bounding_boxes(img, abnormalities)
        
        return {
            'abnormalities': abnormalities,
            'heatmap': heatmap,
            'annotated_image': annotated_img,
            'shape': processed['shape']
        }