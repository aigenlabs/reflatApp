#!/usr/bin/env bash
# Usage: upload_project_media.sh <builderId> <projectId>
# Requires: gsutil authenticated (gcloud auth login) and GS_BUCKET env var set
set -euo pipefail
BUCKET=${GS_BUCKET:-}
if [ -z "$BUCKET" ]; then echo "Please set GS_BUCKET e.g. gs://my-bucket"; exit 1; fi
if [ "$#" -lt 2 ]; then echo "Usage: $0 <builderId> <projectId>"; exit 1; fi
BUILDER=$1
PROJECT=$2
ROOT="tools/seed/${BUILDER}/${PROJECT}"
MEDIA_DIR="$ROOT/media"
if [ ! -d "$MEDIA_DIR" ]; then echo "No media dir found: $MEDIA_DIR"; exit 1; fi
# Upload photos, layouts, floor_plans, logos, brochures by subfolder
for sub in photos layouts floor_plans logos brochures banners; do
  if [ -d "$MEDIA_DIR/$sub" ]; then
    echo "Uploading $sub..."
    gsutil -m cp -r "$MEDIA_DIR/$sub/*" "$BUCKET/$sub/$BUILDER/$PROJECT/"
  fi
done

echo "Upload complete"
