"""FRNet integration boundary.

Place the exact FRNet checkpoint/model implementation used by the project here.
The backend owns preprocessing, inference and postprocessing; the frontend never
loads model weights.
"""

class FRNetAdapter:
    def __init__(self, checkpoint: str | None = None):
        self.checkpoint = checkpoint
        self.loaded = bool(checkpoint)

    def predict(self, projection_25d):
        if not self.loaded:
            return {"status": "model_not_loaded", "prediction": None}
        # Replace this adapter call with the project's exact FRNet forward pass.
        return {"status": "ready", "prediction": None}
