# Foveated LiDAR Mapping — 3D Model

The repository is intentionally split into two applications:

```text
3d-model/
├── frontend/   # Astro + React + Three.js visualization/UI
└── backend/    # FastAPI LiDAR generation, projections, model boundary and state WebSocket
```

## Runtime flow

`3D cube input → point cloud → 2D polar projection → 2.5D range grid → FRNet adapter → frontend`

The frontend does not own LiDAR/model preprocessing. It requests processed data from the backend and renders the synchronized 3D, 2D and 2.5D views.

## Run

Backend:

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_BACKEND_URL` when the backend is not on `http://localhost:8000`.

> FRNet weights and the exact project-specific FRNet forward pass are intentionally kept behind `backend/app/models/frnet.py`; no model weights are fabricated or embedded in this repository.
