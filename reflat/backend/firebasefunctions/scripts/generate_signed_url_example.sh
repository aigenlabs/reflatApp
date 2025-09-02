#!/usr/bin/env bash
# Example usage of the signed_url endpoint. Replace FUNCTIONS_URL with your deployed functions base URL.
FUNCTIONS_URL="http://localhost:5001/YOUR_PROJECT/us-central1/api"
FOLDER=photos
BUILDER=sampleBuilder
PROJECT=sampleProject
FILE=exterior1.jpg

curl -sS "${FUNCTIONS_URL}/signed_url?folder=${FOLDER}&builderId=${BUILDER}&projectId=${PROJECT}&file=${FILE}" | jq
