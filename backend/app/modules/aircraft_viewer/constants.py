from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
AIRCRAFT_VIEWER_DIRECTORY = (
    PROJECT_ROOT / "private_uploads" / "UH-60M - CCP_Windows" / "resources" / "app"
).resolve()
AIRCRAFT_VIEWER_INDEX_FILE = AIRCRAFT_VIEWER_DIRECTORY / "index.htm"
AIRCRAFT_VIEWER_ROUTE_PREFIX = "/api/v1/aircraft-viewer"
