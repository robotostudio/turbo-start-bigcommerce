#!/usr/bin/env bash
# Register the nine catalog webhooks against the deployed receiver.
#
# Idempotent: it lists what is already registered and only creates what is
# missing, so running it twice does not produce eighteen hooks. Pass --delete to
# remove every hook pointing at the destination instead, which is what you want
# before tearing a tunnel down.
#
# Scopes are ROB-2613's answer, and the sku ones are not optional: a variant
# edit fires store/sku/updated and no product event at all. Measured, in
# docs/research/09-webhook-payloads.md.
set -euo pipefail

cd "$(dirname "$0")/.."

# The admin token lives here, not in apps/web — the storefront token cannot
# reach /v3/hooks.
set -a; . packages/sanity-sync/.env; set +a
: "${BIGCOMMERCE_STORE_HASH:?missing from packages/sanity-sync/.env}"
: "${BIGCOMMERCE_ADMIN_TOKEN:?missing from packages/sanity-sync/.env}"

DEST="${BIGCOMMERCE_WEBHOOK_DESTINATION:-$(grep -m1 '^BIGCOMMERCE_WEBHOOK_DESTINATION=' apps/web/.env.local | cut -d= -f2-)}"
SECRET="$(grep -m1 '^BIGCOMMERCE_WEBHOOK_SECRET=' apps/web/.env.local | cut -d= -f2- | tr -d '\r\n')"
[ -n "$DEST" ]   || { echo "no BIGCOMMERCE_WEBHOOK_DESTINATION" >&2; exit 1; }
[ -n "$SECRET" ] || { echo "no BIGCOMMERCE_WEBHOOK_SECRET" >&2; exit 1; }

API="https://api.bigcommerce.com/stores/${BIGCOMMERCE_STORE_HASH}/v3"
AUTH=(-H "X-Auth-Token: ${BIGCOMMERCE_ADMIN_TOKEN}" -H "Accept: application/json")

SCOPES=(
  store/product/created  store/product/updated  store/product/deleted
  store/category/created store/category/updated store/category/deleted
  store/sku/created      store/sku/updated      store/sku/deleted
)

echo "destination: $DEST"
echo

existing() { curl -s "${AUTH[@]}" "$API/hooks"; }

if [ "${1:-}" = "--delete" ]; then
  echo "Deleting every hook on this destination:"
  existing | DEST="$DEST" python3 -c "
import json, os, sys
for h in json.load(sys.stdin).get('data', []):
    if h.get('destination','').rstrip('/') == os.environ['DEST'].rstrip('/'):
        print(h['id'], h['scope'])
" | while read -r id scope; do
    curl -s -X DELETE "${AUTH[@]}" "$API/hooks/$id" -o /dev/null -w "  deleted $scope (http %{http_code})\n"
  done
  echo
  existing | python3 -c "import json,sys; print('hooks remaining on the store:', len(json.load(sys.stdin).get('data',[])))"
  exit 0
fi

HAVE="$(existing | DEST="$DEST" python3 -c "
import json, os, sys
d = os.environ['DEST'].rstrip('/')
for h in json.load(sys.stdin).get('data', []):
    if h.get('destination','').rstrip('/') == d and h.get('is_active'):
        print(h['scope'])
")"

for scope in "${SCOPES[@]}"; do
  if grep -qx "$scope" <<<"$HAVE"; then
    echo "  $scope: already active, left alone"
    continue
  fi
  # The header is the only authentication BigCommerce offers. The payload's
  # own `hash` is an unkeyed SHA-1 and proves nothing about the sender.
  code=$(curl -s -o /tmp/hook-resp.json -w "%{http_code}" -X POST "$API/hooks" \
    "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "$(SCOPE="$scope" DEST="$DEST" SECRET="$SECRET" python3 -c "
import json, os
print(json.dumps({
  'scope': os.environ['SCOPE'],
  'destination': os.environ['DEST'],
  'is_active': True,
  'headers': {'x-bigcommerce-webhook-secret': os.environ['SECRET']},
}))")")
  if [ "$code" = "200" ] || [ "$code" = "201" ]; then
    echo "  $scope: registered"
  else
    echo "  $scope: FAILED (http $code)" >&2
    head -c 300 /tmp/hook-resp.json >&2; echo >&2
  fi
done
rm -f /tmp/hook-resp.json

echo
echo "Active hooks on this destination:"
existing | DEST="$DEST" python3 -c "
import json, os, sys
d = os.environ['DEST'].rstrip('/')
rows = [h for h in json.load(sys.stdin).get('data', []) if h.get('destination','').rstrip('/') == d]
for h in sorted(rows, key=lambda r: r['scope']):
    print(f\"  {h['id']}  {h['scope']}  active={h['is_active']}\")
print(f'  {len(rows)} total')
"
