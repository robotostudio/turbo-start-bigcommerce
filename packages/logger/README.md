# @workspace/logger

Logging for the monorepo, on top of [evlog](https://www.evlog.dev/).

Output goes to stdout, which is what Vercel collects today. Nothing else is
wired up yet — the package exists in this shape so that adding a log drain
later is one edit in one file.

## Usage

Unchanged from before evlog:

```typescript
import { Logger } from "@workspace/logger";

const logger = new Logger("MyComponent");

logger.info("Application started");
logger.warn("This is a warning");
logger.error("An error occurred", error);
```

## Pass fields, not sentences

A log line is a string. A log **event** has fields something can filter on.
Anything after the message is sorted into the event:

```typescript
logger.error("sync failed", { entityId: 180, scope: "store/product/updated" });
```

```json
{
  "level": "error",
  "tag": "BigCommerceWebhook",
  "message": "sync failed",
  "entityId": 180,
  "scope": "store/product/updated"
}
```

- a plain object becomes fields
- an `Error` becomes `error`, flattened, with its stack — spreading one gives
  you `{}`, because an Error's own properties are non-enumerable
- anything else lands in `details`, so it is not silently dropped
- `tag` and `message` always win, so a caller's `{ message }` cannot blank the
  line out

`logger.error(\`sync failed for ${id}\`)` still works and still reads fine in a
terminal. It just gives a drain a string to grep instead of a number to filter,
which is the difference worth caring about once one is attached.

## Adding a drain

One edit, in `apps/web/src/instrumentation.ts`:

```typescript
import { createAxiomDrain } from "evlog/axiom";

initLogging({ env: { service: "web" }, drain: createAxiomDrain() });
```

evlog ships adapters for Axiom, Sentry, Better Stack, Datadog, PostHog, Grafana
Loki, ClickHouse, HyperDX and OTLP — `evlog/axiom`, `evlog/sentry` and so on —
plus `createHttpDrain` from `evlog/http` for anything else.

**That snippet is not enough on Vercel.** evlog fires the drain as a floating
promise and only awaits it when a `waitUntil` is threaded through
(`audit-*.mjs:200`), and the `log.*` surface this package drives never passes
one. On a lambda that freezes the moment it responds, the drain's `fetch` dies
mid-flight — and the errors logged on the way out of a 500 are the ones most
likely to go. Wire `evlog/next/instrumentation`, which exists for this, or
thread Next's `after()`, before trusting anything the drain reports.

**Do not turn pretty printing back on in the same breath.** evlog's
`log.info(tag, message)` path prints and returns before the drain runs, so a
drain configured alongside `pretty: true` never sees a log that carries no
extra fields — which is most of them. `initLogging` defaults `pretty` to `false`
whenever a drain is present for exactly this reason; passing `pretty: true`
explicitly overrides that and reopens the hole.

## Runtimes

`package.json` maps `browser` to `src/client.ts` and everything else — including
`edge-light` and `worker`, which are listed ahead of it on purpose — to
`src/index.ts`. `Logger` behaves the same either way; callers never pick.

The order matters. Next's edge compilation matches `browser` if you let it, and
evlog's browser runtime opens with `if (!isBrowser()) return`, so every edge log
would be dropped in silence. `apps/web/src/proxy.ts` is a live edge bundle.

`initLogging` is the one thing that is *not* the same on both sides. The browser
build has no drain at all, only a `transport` that POSTs to an ingest route this
repo does not have, so `src/client.ts` deliberately does not export it. Client
logs are console-only. A drain covers the server.

## Known gaps

**CLI output changed shape.** `pretty` is on whenever `NODE_ENV` is not
`production`, which covers `seed`, `sync`, `verify` and the studio scripts. In
that mode evlog writes every level to stdout through `console.log`, so
`logger.error` no longer goes to stderr, severity is colour rather than the word
`ERROR`, and `pnpm seed > log.txt` captures ANSI escapes. Nothing in `scripts/`
or `.github/` reads stderr today, so nothing is broken. `initLogging({ pretty:
false })` in a script entry point restores all three at once.

**Client logs cannot reach a drain.** The browser build offers `transport`, not
`drain`, and it POSTs to an ingest route this repo does not have. `preview-bar`
and `featured-products` log to the browser console and stop there.

## Files

- `src/core.ts` — the class and the argument sorting, with no evlog import
- `src/index.ts` — server entry, plus `initLogging`
- `src/client.ts` — browser entry
