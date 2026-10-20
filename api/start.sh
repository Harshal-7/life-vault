#!/usr/bin/env bash
# Start the API and the background worker side by side. If either one exits,
# exit too, so Fly restarts the machine instead of running half an app.
set -euo pipefail

arq worker.WorkerSettings &
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8080}" --proxy-headers --forwarded-allow-ips="*" &

wait -n
exit $?
