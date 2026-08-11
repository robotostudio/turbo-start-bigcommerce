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

**Do not turn pretty printing back on in the same breath.** evlog's
`log.info(tag, message)` path prints and returns before the drain runs, so a
drain configured alongside `pretty: true` never sees a log that carries no
extra fields — which is most of them. `initLogging` defaults `pretty` to `false`
whenever a drain is present for exactly this reason; passing `pretty: true`
explicitly overrides that and reopens the hole.

## Runtimes

`package.json` maps the `browser` export condition to `src/client.ts`, so a
client component gets evlog's browser bundle and everything else gets the Node
one. The API is identical either way; callers never pick.

## Files

- `src/core.ts` — the class and the argument sorting, with no evlog import
- `src/index.ts` — server entry, plus `initLogging`
- `src/client.ts` — browser entry
