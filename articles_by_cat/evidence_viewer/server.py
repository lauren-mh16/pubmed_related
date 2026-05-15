#!/usr/bin/env python3

import argparse
import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheStaticHandler(SimpleHTTPRequestHandler):
    """Disable browser caching so local viewer edits show up immediately."""

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the local evidence viewer.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    handler = partial(NoCacheStaticHandler, directory=os.fspath(root))
    server = ThreadingHTTPServer((args.host, args.port), handler)

    print(f"Serving evidence viewer at http://{args.host}:{args.port}")
    print(f"Root directory: {root}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
