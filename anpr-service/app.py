import cv2
import numpy as np
import pytesseract
from flask import Flask, request, jsonify
from ultralytics import YOLO
import re

app = Flask(__name__)

# ---------------------------
# TESSERACT PATH (Windows)
# ---------------------------
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# ---------------------------
# LOAD YOLO MODEL
# ---------------------------
try:
    model = YOLO("yolov8n.pt")   # vehicle detection
    CAR_CLASS_ID = 2             # YOLO class id for car
    print("YOLO model loaded successfully")
except Exception as e:
    print(f"Error loading YOLO model: {e}")

# ---------------------------
# IMAGE PREPROCESSING
# ---------------------------
def preprocess_plate(img):

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    gray = cv2.resize(gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
    gray = clahe.apply(gray)

    gray = cv2.GaussianBlur(gray, (3,3), 0)

    _, thresh = cv2.threshold(gray, 0, 255,
                              cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    return thresh

# ---------------------------
# CLEAN & EXTRACT PLATE TEXT
# ---------------------------
def clean_plate_text(text):
    """Extract valid Indian plate format from noisy text (Step 4 & 5)"""
    # 1. Basic cleanup: uppercase and remove weird symbols (keep digits and A-Z)
    text = text.upper()
    
    # 2. Indian Plate Regex Patterns
    # Standard: DL 3C AY 1234 or KL 68 B 1597
    # Note: We remove spaces first to match the pattern easily
    cleaned_all = re.sub(r'[^A-Z0-9]', '', text)
    
    # Look for Indian plate pattern: 2 letters, 2 digits, 1-2 letters, 4 digits
    # Examples: KL68B1597, DL3CAY1234
    patterns = [
        r'[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}',  # Primary pattern
        r'[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{3}',   # Some plates have 3 digits
        r'[A-Z]{3}[0-9]{2}[A-Z]{1,2}[0-9]{4}'    # Defense/Old plates
    ]
    
    for pattern in patterns:
        match = re.search(pattern, cleaned_all)
        if match:
            return match.group(0)
            
    # Fallback: If no regex match but the string is reasonably plate-like (6-11 chars)
    # This handles edge cases where OCR might miss one character but the rest is clean
    if 6 <= len(cleaned_all) <= 11:
        return cleaned_all

    return ""


# ---------------------------
# DETECT PLATE API
# ---------------------------
@app.route('/detect-plate', methods=['POST'])
def detect_plate():

    try:

        if 'image' not in request.files:
            return jsonify({"success": False, "message": "No image uploaded"}), 400

        file = request.files['image']
        content = file.read()

        if not content:
            return jsonify({"success": False, "message": "Empty image uploaded"}), 400

        img_bytes = np.frombuffer(content, np.uint8)
        img = cv2.imdecode(img_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({"success": False, "message": "Invalid image"}), 400

        print(f"[ANPR] Image received: {img.shape}")

        detected_plates = []

        # ---------------------------
        # YOLO VEHICLE DETECTION
        # ---------------------------
        results = model(img)

        for r in results:

            boxes = r.boxes
            classes = r.boxes.cls

            print(f"[ANPR] Boxes detected: {len(boxes)}")

            for box, cls in zip(boxes, classes):

                if int(cls) != CAR_CLASS_ID:
                    continue

                coords = box.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = coords.astype(int)
                conf = float(box.conf[0])

                car_crop = img[max(0, y1):min(img.shape[0], y2), max(0, x1):min(img.shape[1], x2)]

                if car_crop.size == 0:
                    continue

                # ---------------------------
                # CROP LIKELY PLATE REGION (Heuristic)
                # ---------------------------
                h, w = car_crop.shape[:2]

                # If the crop is already plate-shaped (wide and short), don't crop further
                if w/h > 3.0: 
                    plate_crop = car_crop
                else:
                    # Assume plate is in bottom half
                    plate_crop = car_crop[int(h*0.4):h, int(w*0.05):int(w*0.95)]

                if plate_crop.size == 0:
                    continue

                # Save debug image
                cv2.imwrite("debug_plate.jpg", plate_crop)

                # ---------------------------
                # PREPROCESS & OCR
                # ---------------------------
                processed = preprocess_plate(plate_crop)
                
                # Try PSM 8 (single word) and PSM 7 (single line)
                for psm in ['8', '7']:
                    custom_config = f'--oem 3 --psm {psm} -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                    raw_text = pytesseract.image_to_string(processed, config=custom_config)
                    clean_text = clean_plate_text(raw_text)
                    
                    if clean_text:
                        print(f"[ANPR] Detected (PSM {psm}): {clean_text}")
                        detected_plates.append({
                            "plate": clean_text,
                            "confidence": conf
                        })
                        break

        # ---------------------------
        # FALLBACK IF NO CAR DETECTED (Plate-only Photo)
        # ---------------------------
        if not detected_plates:

            print("[ANPR] No vehicle detected or no text found in crops, trying full image OCR")

            processed = preprocess_plate(img)

            for psm in ['8', '7', '11']:
                custom_config = f'--oem 3 --psm {psm} -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
                raw_text = pytesseract.image_to_string(processed, config=custom_config)
                clean_text = clean_plate_text(raw_text)
                print(f"[ANPR] Fallback OCR (PSM {psm}): Raw='{raw_text.strip()}' Clean='{clean_text}'")

                if clean_text:
                    detected_plates.append({
                        "plate": clean_text,
                        "confidence": 0.5
                    })
                    break

        # ---------------------------
        # RETURN BEST RESULT
        # ---------------------------
        if detected_plates:

            best = sorted(detected_plates,
                          key=lambda x: x['confidence'],
                          reverse=True)[0]

            return jsonify({
                "success": True,
                "plate": best['plate'],
                "confidence": best['confidence']
            })

        else:

            return jsonify({
                "success": False,
                "message": "No plate detected"
            }), 404


    except Exception as e:

        import traceback

        print("[ANPR ERROR]", str(e))
        traceback.print_exc()

        return jsonify({
            "success": False,
            "error": str(e)
        }), 500


# ---------------------------
# START SERVER
# ---------------------------
if __name__ == '__main__':

    app.run(host='0.0.0.0', port=5000)