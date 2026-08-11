#!/usr/bin/env bash
# Push the three secret env vars to Vercel, Production and Preview.
#
# Reads each value out of the env file that already holds it and pipes it
# straight to `vercel env add`. Nothing is printed, nothing is retyped, and no
# value is ever passed as an argument where it would land in shell history.
#
# Run from anywhere:  ./scripts/set-vercel-secrets.sh
#
# Every vercel call names the project explicitly rather than relying on a
# `.vercel` link. A git worktree does not inherit the link from its main
# checkout, and an unlinked directory makes `vercel env ls` fail in a way that
# reads as "no variables are set" rather than as an error — which is exactly
# how this script lied the first time it ran.
#
# The other three vars a deploy needs — SANITY_PROJECT_ID, SANITY_DATASET and
# BIGCOMMERCE_WEBHOOK_DESTINATION — are not secrets and are already set.
set -uo pipefail

cd "$(dirname "$0")/.."

VC=(vercel --scope roboto)
PROJECT=(--project turbo-start-bigcommerce-web)

preflight() {
  local out
  if ! out="$("${VC[@]}" env ls production "${PROJECT[@]}" 2>&1)"; then
    echo "Cannot reach the project. Vercel said:" >&2
    echo "$out" | tail -3 >&2
    echo >&2
    echo "If it is an auth problem, run: vercel login" >&2
    exit 1
  fi
}

has() { # NAME environment
  "${VC[@]}" env ls "$2" "${PROJECT[@]}" 2>/dev/null | grep -q "^ $1 "
}

push() { # NAME source-file
  local name="$1" file="$2" value
  value="$(grep -m1 "^${name}=" "$file" 2>/dev/null | cut -d= -f2- | tr -d '\r\n')"

  if [ -z "$value" ]; then
    echo "  $name: NOT FOUND in $file — skipped" >&2
    return
  fi

  for target in production preview; do
    if has "$name" "$target"; then
      echo "  $name ($target): already set, left alone"
      continue
    fi
    local out
    if out="$(printf '%s' "$value" | "${VC[@]}" env add "$name" "$target" "${PROJECT[@]}" 2>&1)"; then
      echo "  $name ($target): added"
    else
      # Print what Vercel actually said. Swallowing this is what made the first
      # version report six identical FAILEDs with no cause.
      echo "  $name ($target): FAILED" >&2
      echo "$out" | grep -vi '^$' | tail -3 | sed 's/^/      /' >&2
    fi
  done
}

preflight
echo "Pushing secrets to Vercel (values never printed)"
push BIGCOMMERCE_ADMIN_TOKEN    packages/sanity-sync/.env
push BIGCOMMERCE_WEBHOOK_SECRET apps/web/.env.local
push CRON_SECRET                apps/web/.env.local

echo
echo "Checking all six are present:"
missing=0
for target in production preview; do
  echo "  $target:"
  for name in SANITY_PROJECT_ID SANITY_DATASET BIGCOMMERCE_WEBHOOK_DESTINATION \
              BIGCOMMERCE_ADMIN_TOKEN BIGCOMMERCE_WEBHOOK_SECRET CRON_SECRET; do
    if has "$name" "$target"; then
      echo "    ok      $name"
    else
      echo "    MISSING $name"
      missing=$((missing + 1))
    fi
  done
done

echo
if [ "$missing" -eq 0 ]; then
  echo "All six present in both environments. Safe to deploy."
else
  echo "$missing still missing. The build will fail until they are set." >&2
  exit 1
fi
