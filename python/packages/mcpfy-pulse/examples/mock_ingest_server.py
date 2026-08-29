"""Stand-in for https://api.mcpfy.ai/v1/telemetry/ingest, for local testing only.
Accepts anything with a Bearer token and prints each received batch.

    python examples/mock_ingest_server.py [port]
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        pass  # silence default access log; we print structured batch summaries instead

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", 0))
        raw = self.rfile.read(length)
        auth = self.headers.get("authorization", "")

        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            return

        now = datetime.now(timezone.utc).strftime("%H:%M:%S")
        events = body.get("events", [])
        print(f"[{now}] POST {self.path}  auth={auth!r}")
        print(f"  sdkName={body.get('sdkName')!r} installMode={body.get('installMode')!r} serverName={body.get('serverName')!r}")
        for event in events:
            summary = {k: v for k, v in event.items() if k not in ("declaredTools",)}
            print(f"  event: {summary}")
            if "declaredTools" in event:
                for tool in event["declaredTools"]:
                    print(f"    declaredTool: {tool}")
        sys.stdout.flush()

        self.send_response(202)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"queued": len(events)}).encode("utf-8"))


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8787
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"mock ingest server listening on http://127.0.0.1:{port}")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
