#!/usr/bin/env bash
# Interaction-layer parity recorder. Drives the same user flow on one site and
# screenshots each step; run it once per side and compare the shots + log.
#
#   scripts/parity/interactions.sh <base-url> <label> <out-dir>
#   scripts/parity/interactions.sh https://turbo-start-shopify-web.vercel.app ref  ~/shots
#   scripts/parity/interactions.sh http://localhost:3000                     local ~/shots
#
# Flow: PDP size select → colour select (aster has Indigo Rinse / Warm Stone)
# → add to cart → cart count → search modal + query → cart page.
#
# Uses the `parity` agent-browser session. Steps that fail are logged and the
# run continues — a broken step on the local side is a finding, not an abort.

set -u
BASE="${1:?base url}"
LABEL="${2:?label (ref|local)}"
OUT="${3:?output dir}"
mkdir -p "$OUT"
LOG="$OUT/$LABEL-interactions.log"
: >"$LOG"

AB=(agent-browser --session parity --profile "$HOME/.agent-browser/profiles/parity")

note() { printf '%s\n' "$*" | tee -a "$LOG"; }

step() { # step <name> <cmd...>
  local name="$1"
  shift
  if "$@" >>"$LOG" 2>&1; then
    note "OK   $LABEL $name"
  else
    note "FAIL $LABEL $name  ($*)"
  fi
}

shot() { step "shot:$1" "${AB[@]}" screenshot "$OUT/$LABEL-$1.png"; }

note "== $LABEL @ $BASE =="

# 1. PDP baseline
step open "${AB[@]}" open "$BASE/products/aster-denim-coach-jacket"
step load "${AB[@]}" wait --load networkidle
shot 01-pdp

# 2. Size select
step size-M "${AB[@]}" find role button click --name "M" --exact
step size-settle "${AB[@]}" wait --load networkidle
shot 02-size-M

# 3. Colour select (two-colourway product)
step colour-warm-stone "${AB[@]}" find role button click --name "Warm Stone" --exact
step colour-settle "${AB[@]}" wait --load networkidle
shot 03-colour-warm-stone

# 4. Add to cart. The cart drawer opens; its text carries the count and totals.
step add-to-cart "${AB[@]}" find role button click --name "Add to cart" --exact
step add-settle "${AB[@]}" wait 1500
shot 04-after-add
step cart-drawer-text "${AB[@]}" get text "[role=dialog]"

# 5. Close the drawer, then open the search modal and type a term
step drawer-close "${AB[@]}" find role button click --name "Close" --exact
step drawer-gone "${AB[@]}" wait --fn "!document.querySelector('[role=dialog]')"
step open-search "${AB[@]}" find role link click --name "Search" --exact
step search-settle "${AB[@]}" wait 1200
step search-type "${AB[@]}" find role textbox fill "jacket"
step search-results "${AB[@]}" wait 1500
shot 05-search-jacket

# 6. Cart page
step open-cart "${AB[@]}" open "$BASE/cart"
step cart-load "${AB[@]}" wait --load networkidle
shot 06-cart-page

note "== $LABEL done — log: $LOG =="
