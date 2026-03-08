#!/bin/bash
cd "$(dirname "$0")/backend"
.venv/bin/python -m uvicorn arbiter.main:app --host 0.0.0.0 --port 8888 --reload
