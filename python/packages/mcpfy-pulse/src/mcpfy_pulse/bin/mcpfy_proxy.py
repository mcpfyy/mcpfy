#!/usr/bin/env python3
"""Console-script entry point registered as `mcpfy-proxy` in pyproject.toml.
Mirrors typescript/packages/mcpfy-pulse/src/bin/mcpfy-proxy.ts."""

from __future__ import annotations

import asyncio
import sys

from ..proxy.run import run_proxy


def main() -> None:
    try:
        exit_code = asyncio.run(run_proxy(sys.argv[1:]))
    except Exception as err:
        sys.stderr.write(f"mcpfy-proxy: {err}\n")
        sys.exit(1)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
