# Sentinel

**A Human-in-the-Loop AI Framework for Electoral De-Duplication**

Sentinel is a privacy-preserving biometric de-duplication system designed to detect and resolve duplicate voter registrations in large electoral datasets. It combines a facial-recognition pipeline (FaceNet embeddings + cosine similarity) with a three-zone decision model that keeps a human reviewer in the loop for ambiguous cases — ensuring fairness, auditability, and accountability at scale.

> 📄 Published at **IEEE ICKECS 2026** — Paper ID 1086. See [`docs/`](./docs) for the full report and paper.

---

## How it works

1. **Face detection** — OpenCV Haar cascades locate the largest face in each image.
2. **Feature extraction** — A pretrained `InceptionResnetV1` (FaceNet, VGGFace2 weights) converts the cropped face into a 512-dimensional embedding.
3. **Similarity scoring** — Two embeddings are compared using cosine similarity.
4. **Three-zone decision** — Instead of a single yes/no threshold, results fall into three zones so humans only review the uncertain middle band:

   | Cosine similarity | Status            | Action                         |
   | ----------------- | ----------------- | ------------------------------ |
   | `>= 0.72`         | `MATCH`           | Flagged as a duplicate         |
   | `0.45 – 0.72`     | `POTENTIAL_MATCH` | Routed to a human reviewer     |
   | `< 0.45`          | `NO_MATCH`        | Treated as distinct voters     |

---

## Project structure

```
.
├── backend/
│   ├── app.py                 # Flask API: face detection, embeddings, comparison
│   ├── requirements.txt
│   └── voter_image_pool/      # Sample test images (public figures)
├── frontend/
│   ├── index.html             # Comparison workbench UI
│   ├── script.js
│   └── style.css
└── docs/                      # Research report, IEEE paper, submission record
```

---

## Getting started

### 1. Backend (Flask API)

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
python app.py
```

The API starts on **http://127.0.0.1:5000**. On first run it downloads the pretrained FaceNet (VGGFace2) weights.

**Endpoints**
- `GET /get_voters` — list images in the pool
- `GET /images/<filename>` — serve an image
- `POST /compare` — compare two images (`{ "file1": "...", "file2": "..." }`)

### 2. Frontend

Open `frontend/index.html` in your browser (the backend must be running first). The UI loads the image pool and lets you pick any two faces to compare and see the similarity score and match status.

---

## Notes on data & privacy

The sample images in `backend/voter_image_pool/` are photos of **public figures**, included only to demonstrate the comparison workflow. No real voter data, personal photos, or biometric databases are distributed with this project — drop your own test images into `voter_image_pool/` to experiment.

---

## Authors

Developed at the **Department of Computer Science and Engineering, The National Institute of Engineering, Mysuru**, by Suhas U, Sujay Mudakappa Matur, and team, under the guidance of the department faculty.
