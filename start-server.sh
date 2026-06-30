#!/bin/bash
cd /home/z/my-project
while true; do
  npx next dev --turbopack -p 3000 >> /home/z/my-project/dev.log 2>&1
  echo "Server crashed, restarting in 2s..." >> /home/z/my-project/dev.log
  sleep 2
done