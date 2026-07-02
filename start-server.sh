#!/bin/bash
# Run the Next.js dev server from the project root, auto-restarting on crash.
cd "$(dirname "$0")"
while true; do
  npx next dev --turbopack -p 3000
  echo "Server crashed, restarting in 2s..."
  sleep 2
done
