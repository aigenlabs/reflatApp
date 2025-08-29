#!/usr/bin/env bash
set -euo pipefail

# Simple smoke tests for the unified listings API (POST/GET)
# Usage:
#   BASE=https://your-cloud-run-url/api bash scripts/test_listings.sh

DEFAULT_BASE="https://api-j7h3kbr6rq-el.a.run.app/api"
BASE="${BASE:-$DEFAULT_BASE}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 1
fi

JQ=""
if command -v jq >/dev/null 2>&1; then
  JQ="jq -r"
fi

echo "Using BASE=$BASE"

post() {
  local endpoint="$1"; shift
  local label="$1"; shift
  echo "\n=== POST $endpoint ($label) ==="
  http_body=$(cat)
  http_resp=$(curl -sS -X POST "$BASE/$endpoint" \
    -H "Content-Type: application/json" \
    -d "$http_body" \
    -w "\n%{http_code}")
  http_code=$(echo "$http_resp" | tail -n1)
  body=$(echo "$http_resp" | sed '$d')
  echo "HTTP $http_code"
  if [ -n "$JQ" ]; then echo "$body" | $JQ .; else echo "$body"; fi
}

get() {
  local url="$1"; shift
  echo "\n=== GET $url ==="
  http_resp=$(curl -sS "$BASE/$url" -w "\n%{http_code}")
  http_code=$(echo "$http_resp" | tail -n1)
  body=$(echo "$http_resp" | sed '$d')
  echo "HTTP $http_code"
  if [ -n "$JQ" ]; then echo "$body" | $JQ .; else echo "$body"; fi
}

# 1) Create a RENT listing
post "listings" "rent sample" <<'JSON'
{
  "mode": "rent",
  "listing": {
    "title": "2BHK Apartment in Kondapur",
    "propertyType": "Apartment",
    "bedrooms": 2,
    "bathrooms": 2,
    "rent": 32000,
    "deposit": 64000,
    "maintenance": 2000,
    "city": "Hyderabad",
    "locality": "Kondapur",
    "projectId": "aparna-sarit",
    "projectName": "Aparna Sarit",
    "address": "Plot 12, Kondapur",
    "facing": "East",
    "contactName": "Ravi",
    "contactPhone": "9876543210",
    "notes": "Available from next month"
  }
}
JSON

# 2) Create a RESALE listing
post "listings" "resale sample" <<'JSON'
{
  "mode": "resale",
  "listing": {
    "title": "3BHK in Madhapur",
    "propertyType": "Apartment",
    "bedrooms": 3,
    "bathrooms": 3,
    "price": 12000000,
    "maintenance": 3500,
    "city": "Hyderabad",
    "locality": "Madhapur",
    "projectId": "ramky-towers",
    "projectName": "Ramky Towers",
    "address": "Hitech City Rd, Madhapur",
    "facing": "West",
    "contactName": "Priya",
    "contactPhone": "9123456789",
    "notes": "Negotiable"
  }
}
JSON

# 3) Fetch recent RENT listings for Hyderabad/Kondapur (limit 10)
get "listings?mode=rent&city=Hyderabad&locality=Kondapur&limit=10"

# 4) Fetch RESALE listings filtered by project
get "listings?mode=resale&city=Hyderabad&locality=Madhapur&projectId=ramky-towers&limit=10"

echo "\nDone."

