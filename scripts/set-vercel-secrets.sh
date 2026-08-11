#!/usr/bin/env bash
# Push the three secret env vars to Vercel, Production and Preview.
#
# Reads each value out of the env file that already holds it and pipes it
# straight to `vercel env add`. Nothing is printed, nothing is retyped, and no
# value is ever passed as an argument where it would land in shell history.
#
# Run from the repo root:  ./scripts/set-vercel-secrets.sh
#
# The other three vars a deploy needs — SANITY_PROJECT_ID, SANITY_DATASET and
# BIGCOMMERCE_WEBHOOK_DESTINATION — are not secrets and are already set.
set -euo pipefail

cd "$(dirname "$0")/.."

push() { # NAME  source-file
  local name="$1" file="$2"
  local value
  value="$(grep -m1 "^${name}=" "$file" | cut -d= -f2- | tr -d '\r\n')"

  if [ -z "$value" ]; then
    echo "  $name: NOT FOUND in $file — skipped" >&2
    return 1
  fi

  for target in production preview; do
    if vercel env ls "$target" 2>/dev/null | grep -q "^ ${name} "; then
      echo "  $name ($target): already set, left alone"
    else
      printf '%s' "$value" | vercel env add "$name" "$target" >/dev/null 2>&1 \
        && echo "  $name ($target): added" \
        || echo "  $name ($target): FAILED" >&2
    fi
  done
}

echo "Pushing secrets to Vercel (values never printed)"
push BIGCOMMERCE_ADMIN_TOKEN    packages/sanity-sync/.env
push BIGCOMMERCE_WEBHOOK_SECRET apps/web/.env.local
push CRON_SECRET                apps/web/.env.local

echo
echo "Checking all six are present:"
for target in production preview; do
  echo "  $target:"
  for name in SANITY_PROJECT_ID SANITY_DATASET BIGCOMMERCE_WEBHOOK_DESTINATION \
              BIGCOMMERCE_ADMIN_TOKEN BIGCOMMERCE_WEBHOOK_SECRET CRON_SECRET; do
    if vercel env ls "$target" 2>/dev/null | grep -q "^ ${name} "; then
      echo "    ok      $name"
    else
      echo "    MISSING $name"
    fi
  done
done
