#!/bin/sh
#
# Scan tracked files for references that must not survive the BigCommerce
# conversion.
#
#   scripts/check-forbidden-refs.sh            Shopify terms warn, live IDs fail
#   scripts/check-forbidden-refs.sh --strict   Shopify terms fail too
#
# CI runs the default mode. A later ticket flips the gate to strict by
# appending `--strict` to the workflow step -- a one-word diff.

set -eu

# --- Term lists. Adding a term is one line. ---------------------------------

# A. References to the platform this starter was ported off. WARN ONLY by
#    default. The commerce module itself is gone; what is left is comments and
#    identifiers in code other people are still clearing, so failing here would
#    turn CI red for work already in flight. Flip to strict when it hits zero.
SHOPIFY_TERMS='shopify
Shopify
SHOPIFY_
cdn.shopify.com
myshopify.com
robotostudio/turbo-start-shopify'

#    Historical prose. The gate exists to keep references to the old platform
#    out of shipped code, not to erase how the port was decided. These files are
#    the decision record -- research notes, the spec, the phase plan -- and
#    rewriting them to satisfy a grep would cost the reasoning and buy nothing.
#    They ship no code and a fork never reads them to configure anything.
PROSE_EXCLUDE=':(exclude)docs/research/*
:(exclude)docs/plans/*
:(exclude)docs/agents/*
:(exclude)PLAN.md
:(exclude)SPEC.md
:(exclude)CONTEXT.md'

#    One literal, exempted line by line rather than by file. `gid://shopify/...`
#    appears in tests where REJECTING a legacy id is the assertion -- the string
#    is the input under test, so renaming it would delete the test's meaning.
#    Line-level keeps the rest of those files scanned.
TEST_LITERAL='gid://shopify'

# B. Identifiers belonging to a live system. ALWAYS FAIL.
#
#    The rule this enforces is narrower than "the string never appears": no live
#    system may be reachable as a WRITE TARGET, and no script may default to one
#    when a contributor's env is half-configured. A read of a public URL is not
#    that, which is why list B has one exclusion -- see LIVE_EXCLUDE below.
LIVE_TERMS='ztcucp3r
roboto-merch
roboto-shopify'

#    apps/studio/seed/reference-dataset.ndjson is seed content. Its image
#    references are `_sanityAsset` URLs on Sanity's public image CDN, which the
#    importer downloads and re-uploads into whatever project the contributor
#    owns. The literal names the source of a public read; nothing in the file can
#    address a write. Excluding it is what lets the seed ship 155 KB of content
#    instead of 30 MB of photography. Keep this list to exactly one entry -- a
#    second one means the rule above has stopped being true.
LIVE_EXCLUDE=':(exclude)apps/studio/seed/reference-dataset.ndjson'

# ----------------------------------------------------------------------------

strict=0
if [ "${1:-}" = "--strict" ]; then
  strict=1
fi

cd "$(git rev-parse --show-toplevel)"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# git grep covers tracked files only, skips submodules and files deleted from
# the working tree, and behaves identically on macOS and Ubuntu -- unlike BSD
# vs GNU grep. -F treats terms as literals so dots in hostnames are not
# wildcards; -I skips binaries. It exits 1 when nothing matches.
#
# The lockfile is vendored noise, and this script is itself a list of the terms
# it looks for, so both are excluded.
search() {
  git grep -I -F -n -f "$work/terms" -- . \
    ':(exclude)pnpm-lock.yaml' \
    ':(exclude)scripts/check-forbidden-refs.sh' \
    $extra || true
}

# `extra` holds this list's own pathspecs, newline-separated, and is deliberately
# unquoted below so each one becomes its own argument. `exempt` is a fixed string
# dropped line by line; empty means drop nothing.
#
# Paths are derived from the matched lines rather than a second `git grep -l`, so
# a file whose only hits are exempt does not get listed as an offender.
scan() {
  printf '%s\n' "$1" >"$work/terms"
  if [ -n "$exempt" ]; then
    search | grep -F -v "$exempt" >"$work/lines" || true
  else
    search >"$work/lines"
  fi
  cut -d: -f1 <"$work/lines" | sort -u >"$work/paths"
}

count() {
  wc -l <"$1" | tr -d ' '
}

fail=0

# --- A. Shopify references (warn) -------------------------------------------

extra="$PROSE_EXCLUDE"
exempt="$TEST_LITERAL"
scan "$SHOPIFY_TERMS"
a_lines=$(count "$work/lines")
a_files=$(count "$work/paths")

if [ "$a_lines" -gt 0 ]; then
  printf 'Shopify references: %s matches in %s files\n' "$a_lines" "$a_files"
  while IFS= read -r path; do
    printf '  %s\n' "$path"
  done <"$work/paths"

  if [ "$strict" -eq 1 ]; then
    printf '::error title=Shopify references::%s matches in %s tracked files, and --strict is on.\n' \
      "$a_lines" "$a_files"
    fail=1
  else
    # Annotations are single-line; GitHub truncates anything after a newline.
    printf '::warning title=Shopify references::%s matches in %s tracked files. Still being cleared; the gate goes strict at zero.\n' \
      "$a_lines" "$a_files"
  fi
else
  echo 'Shopify references: none'
fi

echo

# --- B. Live-system identifiers (fail) --------------------------------------

extra="$LIVE_EXCLUDE"
exempt=''
scan "$LIVE_TERMS"
b_lines=$(count "$work/lines")

if [ "$b_lines" -gt 0 ]; then
  printf 'Live-system identifiers: %s matches\n' "$b_lines"
  # Truncated: a match can land in minified data where the line is kilobytes
  # long, and a wall of JSON buries the file:line that actually needs fixing.
  while IFS= read -r hit; do
    printf '  %.160s\n' "$hit"
  done <"$work/lines"
  printf '::error title=Live-system identifier::No identifier belonging to a live system may appear as a literal in this starter, and no script may fall back to one -- a half-configured contributor env must throw, never silently read or delete production data it does not own.\n'
  fail=1
else
  echo 'Live-system identifiers: none'
fi

exit "$fail"
