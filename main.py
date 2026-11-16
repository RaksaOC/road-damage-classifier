"""Road Damage Classifier: serves the web app (app/static) at http://localhost:8000.

usage:
    uv run python main.py
    uv run python main.py --port 8080
"""

import argparse
import functools
import http.server
from pathlib import Path

STATIC = Path(__file__).parent / "app" / "static"


def main() -> None:
    ap = argparse.ArgumentParser(description="Serve the Road Damage Classifier web app.")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(STATIC))
    with http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Road Damage Classifier: http://localhost:{args.port}  (Ctrl+C to stop)")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
