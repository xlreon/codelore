#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/bin"
swiftc -O -parse-as-library -o "$ROOT/bin/codelore-toast" "$ROOT/macos/CodeloreToast.swift"
echo "built $ROOT/bin/codelore-toast"
