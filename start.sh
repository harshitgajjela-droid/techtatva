#!/usr/bin/env bash
# Start both the FastAPI backend and the React dev server.
# Usage: ./start.sh

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting FastAPI backend on http://localhost:8000 ..."
"$ROOT/.venv/bin/uvicorn" app.api:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "Starting React dev server on http://localhost:5173 ..."
cd "$ROOT/app/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:5173"
echo "  API docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait and forward Ctrl+C to both processes
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
