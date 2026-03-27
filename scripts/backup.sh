#!/usr/bin/env bash
set -euo pipefail
mkdir -p backups
cp data/lin_system.db "backups/lin_system_$(date +%Y%m%d_%H%M%S).db"
echo "backup complete"
