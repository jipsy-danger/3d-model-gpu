from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from .processing.lidar import build_demo_frame

app = FastAPI(title="Foveated LiDAR Mapping Backend", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

state = {
    "heading": 180.0,
    "pitch": 28.0,
    "right": [1.0, 0.0, 0.0],
    "up": [0.0, 1.0, 0.0],
    "forward": [0.0, 0.0, 1.0],
    "position": [0.0, 5.5, -7.5],
    "target": [0.0, 0.0, 0.0],
    "fov": 48.0,
    "aspect": 1.0,
    "zoom": 1.0,
    "pan_x": 0.0,
    "pan_y": 0.0,
    "centroid_screen": {"x": 0.0, "y": 0.0, "z": 0.0},
}
clients: set[WebSocket] = set()


def camera_packet():
    return {
        "type": "view_state",
        "heading": state["heading"],
        "pitch": state["pitch"],
        "right": state["right"],
        "up": state["up"],
        "forward": state["forward"],
        "position": state["position"],
        "target": state["target"],
        "fov": state["fov"],
        "aspect": state["aspect"],
        "centroid_screen": state["centroid_screen"],
    }


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "lidar-backend"}


@app.get("/api/frame")
def frame():
    return build_demo_frame()


@app.get("/api/state")
def get_state():
    return state


async def handle_view_socket(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        await ws.send_json(camera_packet())
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "view_state":
                continue
            if "heading" in msg:
                state["heading"] = float(msg["heading"]) % 360.0
            if "pitch" in msg:
                state["pitch"] = float(msg["pitch"])
            for key in ("right", "up", "forward", "position", "target"):
                value = msg.get(key)
                if isinstance(value, list) and len(value) == 3:
                    state[key] = [float(v) for v in value]
            for key in ("fov", "aspect", "zoom", "pan_x", "pan_y"):
                if key in msg:
                    state[key] = float(msg[key])
            centroid_screen = msg.get("centroid_screen")
            if isinstance(centroid_screen, dict):
                state["centroid_screen"] = {
                    "x": float(centroid_screen.get("x", 0.0)),
                    "y": float(centroid_screen.get("y", 0.0)),
                    "z": float(centroid_screen.get("z", 0.0)),
                }
            packet = camera_packet()
            for client in list(clients):
                try:
                    await client.send_json(packet)
                except Exception:
                    clients.discard(client)
    except WebSocketDisconnect:
        clients.discard(ws)


@app.websocket("/ws/view")
async def ws_view(ws: WebSocket):
    await handle_view_socket(ws)


@app.websocket("/ws/state")
async def ws_state(ws: WebSocket):
    await handle_view_socket(ws)
