#!/usr/bin/env bash
echo "Starting Videomaddness Modular Test Server..."

# Check if Python is installed
if command -v python3 &>/dev/null; then
    echo "Starting Python HTTP server on port 8000..."
    (sleep 1 && open http://localhost:8000 || xdg-open http://localhost:8000) &
    python3 -m http.server 8000
    exit 0
elif command -v python &>/dev/null; then
    echo "Starting Python HTTP server on port 8000..."
    (sleep 1 && open http://localhost:8000 || xdg-open http://localhost:8000) &
    python -m http.server 8000
    exit 0
elif command -v npx &>/dev/null; then
    echo "Starting http-server via npx on port 8000..."
    (sleep 1 && open http://localhost:8000 || xdg-open http://localhost:8000) &
    npx http-server -p 8000
    exit 0
else
    echo "ERROR: Neither Python nor Node.js could be detected on your system."
    echo "ES6 modules require an HTTP server to run (local file:// loading fails due to browser CORS policies)."
    echo "Please install Python or Node.js to run this modular test."
    exit 1
fi
