#!/bin/sh
# Convenience launcher for macOS / Linux. Windows users double-click start.bat
cd "$(dirname "$0")" || exit 1
exec node app/server.js --open
