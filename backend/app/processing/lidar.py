import json
import math
from pathlib import Path

RAW_INPUT = Path(__file__).resolve().parents[2] / "data" / "raw" / "cube.json"


def load_raw_cube():
    with RAW_INPUT.open("r", encoding="utf-8") as f:
        return json.load(f)


def build_demo_frame(samples: int = 32):
    raw = load_raw_cube()
    sx, sy, sz = raw["size"]
    half_x, half_y, half_z = sx / 2.0, sy / 2.0, sz / 2.0
    points = []
    for face in range(6):
        for i in range(samples):
            for j in range(samples):
                u = i / (samples - 1)
                v = j / (samples - 1)
                x = -half_x + sx * u
                y = -half_y + sy * v
                z = -half_z + sz * v
                if face == 0: p = [half_x, y, z]
                elif face == 1: p = [-half_x, y, z]
                elif face == 2: p = [x, half_y, z]
                elif face == 3: p = [x, -half_y, z]
                elif face == 4: p = [x, y, half_z]
                else: p = [x, y, -half_z]
                points.append(p)

    vertices = raw.get("vertices", [])
    if vertices:
        centroid = [
            sum(float(v[i]) for v in vertices) / len(vertices)
            for i in range(3)
        ]
    else:
        centroid = [float(v) for v in raw.get("origin", [0.0, 0.0, 0.0])]

    polar = []
    grid = [[None for _ in range(72)] for _ in range(16)]
    for x, y, z in points:
        r = math.hypot(x, z)
        az = (math.degrees(math.atan2(x, z)) + 360.0) % 360.0
        el = math.degrees(math.atan2(y, max(r, 1e-9)))
        d = math.sqrt(x * x + y * y + z * z)
        polar.append({"azimuth": az, "elevation": el, "range": d})
        ring = min(15, max(0, int((el + 90) / 180 * 16)))
        col = min(71, int(az / 360 * 72))
        old = grid[ring][col]
        if old is None or d < old:
            grid[ring][col] = d

    return {
        "input": raw,
        "raw_input": {"path": "backend/data/raw/cube.json", "vertices": raw["vertices"]},
        "points": points,
        "point_count": len(points),
        "centroid": centroid,
        "rings": 16,
        "horizontal_fov_deg": 360,
        "projection_2d": polar,
        "projection_25d": {"rings": 16, "azimuth_bins": 72, "range_grid": grid},
    }
