# Sentinel: Privacy-Preserving Biometric De-duplication System
# Backend Server - V17 (Three-Zone Comparison: Match, Potential, No Match)
# Uses Cosine Similarity with multiple thresholds.

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
from PIL import Image
# import imagehash # No longer needed
import os
import logging
import cv2
from facenet_pytorch import InceptionResnetV1
import torchvision.transforms as transforms
import torch
from numpy.linalg import norm # For cosine similarity calculation

# --- 1. APPLICATION SETUP AND AI MODEL LOADING ---

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] - %(message)s')
app = Flask(__name__)
CORS(app) 

# --- Storage Configuration ---
IMAGE_POOL_DIR = os.path.join(os.getcwd(), "voter_image_pool")
os.makedirs(IMAGE_POOL_DIR, exist_ok=True)
app.logger.info(f"Image pool directory: {IMAGE_POOL_DIR}")

# --- AI Model Loading ---
app.logger.info("Loading AI Models...")
try:
    facenet_model = InceptionResnetV1(pretrained='vggface2').eval()
    cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
    if not os.path.exists(cascade_path):
        possible_paths = [ cascade_path, os.path.join(cv2.__path__[0], 'data', 'haarcascade_frontalface_default.xml'), 'haarcascade_frontalface_default.xml' ]
        found = False; cascade_to_use = None
        for path in possible_paths:
             if os.path.exists(path): cascade_to_use = path; found = True; break
        if not found: raise RuntimeError(f"Haar Cascade file 'haarcascade_frontalface_default.xml' not found.")
        cascade_path = cascade_to_use # Use the found path
    face_cascade = cv2.CascadeClassifier(cascade_path)
    app.logger.info("AI Models loaded successfully.")
except Exception as e:
    app.logger.error(f"FATAL: Could not load AI models. Error: {e}")
    exit()

# --- 2. CORE AI PIPELINE: FEATURE EXTRACTION ---

def get_feature_vector(image_path, filename):
    """Uses OpenCV for detection (Optimized) and FaceNet-PyTorch for feature extraction."""
    try:
        img = cv2.imread(image_path)
        if img is None: raise ValueError(f"Could not read image file '{filename}'.") 
            
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        faces = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(30, 30)) 

        if len(faces) == 0: raise ValueError(f"No clear face detected in image '{filename}'.") 
        
        (x, y, w, h) = sorted(faces, key=lambda f: f[2]*f[3], reverse=True)[0]
        
        face_img_bgr = img[y:y+h, x:x+w]
        face_img_rgb = cv2.cvtColor(face_img_bgr, cv2.COLOR_BGR2RGB) 
        face_img = Image.fromarray(face_img_rgb) 
        
        preprocess = transforms.Compose([
            transforms.Resize((160, 160)), transforms.ToTensor(),
            transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
        ])
        face_tensor = preprocess(face_img).unsqueeze(0)
        
        with torch.no_grad():
            embedding = facenet_model(face_tensor)
            
        return embedding[0].numpy().tolist() # Return as list

    except ValueError as ve: # Catch specific errors raised above
         app.logger.error(f"Input Error during feature extraction for '{filename}': {ve}") 
         raise ve # Re-raise to be caught by endpoint
    except Exception as e:
        app.logger.error(f"Unexpected error during feature extraction for '{filename}': {e}")
        raise Exception(f"Internal error processing '{filename}'. Check server logs.") 


# --- REMOVED HASHING FUNCTION ---

# --- 3. SIMILARITY CALCULATION ---

def cosine_similarity(vec1, vec2):
    """Calculates the Cosine Similarity between two vectors."""
    try:
        v1 = np.array(vec1); v2 = np.array(vec2)
        norm_v1 = norm(v1); norm_v2 = norm(v2)
        if norm_v1 == 0 or norm_v2 == 0: return 0.0
        similarity = np.dot(v1, v2) / (norm_v1 * norm_v2)
        return float(np.clip(similarity, -1.0, 1.0)) 
    except Exception as e:
        app.logger.error(f"Error calculating cosine similarity: {e}")
        raise Exception("Error during similarity calculation.") # Propagate error

# --- 4. FLASK API ENDPOINTS for Comparison Workbench ---

@app.route('/get_voters', methods=['GET'])
def get_voters_in_pool():
    # ... (Unchanged) ...
    try:
        files = [f for f in os.listdir(IMAGE_POOL_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        return jsonify(sorted(files))
    except Exception as e: return jsonify({"error": "Failed to list images from pool."}), 500


@app.route('/images/<filename>')
def serve_image_from_pool(filename):
    # ... (Unchanged) ...
     if '..' in filename or filename.startswith('/'): return jsonify({"error": "Invalid filename"}), 400
     try: return send_from_directory(IMAGE_POOL_DIR, filename)
     except FileNotFoundError: return jsonify({"error": "Image not found"}), 404

@app.route('/compare', methods=['POST'])
def compare_voters_from_pool():
    """Endpoint to compare two images using Cosine Similarity and three thresholds."""
    data = request.get_json()
    if not data or 'file1' not in data or 'file2' not in data:
        return jsonify({"error": "Two filenames ('file1', 'file2') are required."}), 400

    filename1, filename2 = os.path.basename(data['file1']), os.path.basename(data['file2'])
    filepath1, filepath2 = os.path.join(IMAGE_POOL_DIR, filename1), os.path.join(IMAGE_POOL_DIR, filename2)

    if not os.path.exists(filepath1): return jsonify({"error": f"File not found: {filename1}"}), 404
    if not os.path.exists(filepath2): return jsonify({"error": f"File not found: {filename2}"}), 404

    app.logger.info(f"--- Comparing '{filename1}' vs '{filename2}' ---")

    vec1, vec2, similarity = None, None, None 
    try:
        vec1 = get_feature_vector(filepath1, filename1)
        vec2 = get_feature_vector(filepath2, filename2)
        
        if vec1 is None: raise ValueError(f"Could not process {filename1}.")
        if vec2 is None: raise ValueError(f"Could not process {filename2}.")

        similarity = cosine_similarity(vec1, vec2)
        
        if not isinstance(similarity, float):
             raise Exception("Internal error during similarity calculation.")

        # --- THREE-ZONE THRESHOLD LOGIC ---
        MATCH_THRESHOLD = 0.72 # Definite match if >= this
        POTENTIAL_THRESHOLD = 0.45 # Potential match if >= this (and < MATCH_THRESHOLD)
        
        match_status = "" # New field for the result status
        is_match = False # Keep boolean for simple display if needed later

        if similarity >= MATCH_THRESHOLD:
            match_status = "MATCH"
            is_match = True
        elif similarity >= POTENTIAL_THRESHOLD:
            match_status = "POTENTIAL_MATCH"
            is_match = False # Treat potential as not a definite match yet
        else:
            match_status = "NO_MATCH"
            is_match = False
        # --- END THREE-ZONE LOGIC ---

        app.logger.info(f"Comparison result: Similarity={similarity:.4f}, Status='{match_status}'")

        # Return the new match_status
        return jsonify({
            "file1": {"filename": filename1}, 
            "file2": {"filename": filename2},
            "similarity": round(similarity, 4), 
            "is_match": is_match, # Still included, reflects definite match only
            "match_status": match_status, # NEW STATUS FIELD
            "threshold": MATCH_THRESHOLD, # Report the primary match threshold
            "potential_threshold": POTENTIAL_THRESHOLD, # Also report the potential threshold
            "threshold_type": "cosine_similarity >= " 
        })

    except ValueError as ve: # Catch face detection/read errors
         app.logger.error(f"Input Error during comparison: {ve}")
         return jsonify({"error": str(ve)}), 400 
    except Exception as e: # Catch other internal errors
         app.logger.error(f"Internal Server Error during comparison: {e}")
         return jsonify({"error": "An internal server error occurred during comparison."}), 500


# --- 5. RUN THE APPLICATION ---
if __name__ == '__main__':
    app.run(port=5000, debug=True)

