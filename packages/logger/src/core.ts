/**
 * The part of the logger that has no opinion about which runtime it is in.
 *
 * evlog ships two entry points with the same `log` surface — `evlog` for the
 * server and `evlog/client` for the browser — so the class is built here once
 * and handed whichever one the bundler resolved. See `package.json`'s `browser`
 * export condition.
 */

/**
 * One evlog log method. Both forms matter: `(tag, message)` is the readable
 * one-liner, `(event)` is the wide event a drain can query.
 */
type LogMethod = {
  (tag: string, message: string): void;
  (event: Record<string, unknown>): void;
};

/** evlog's `log`, narrowed to what this facade drives. */
export interface EvlogLog {
  debug: LogMethod;
  info: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Names evlog stamps on the event itself, in
 * `{ timestamp, level, ...env, ...event }` — the caller's event spread last, so
 * every one of these is takeable. An `info` call carrying `{ level: "debug" }`
 * lands in the drain as a debug event and alerting never sees it.
 *
 * `tag` and `message` are ours for the same reason.
 */
const RESERVED = [
  "tag",
  "message",
  "timestamp",
  "level",
  "service",
  "environment",
  "version",
  "commitHash",
  "region",
];

/**
 * `name`, `message`, `stack` and the cause chain — deliberately not the error's
 * other own properties. Sanity's `ClientError` carries the whole HTTP
 * `response` on itself, headers included, and spreading that into a log is how
 * a token ends up in a drain.
 *
 * `cause` earns its place: a failed `fetch` reports `fetch failed` and nothing
 * else, and the reason anyone actually needs — `ENOTFOUND`, `ECONNREFUSED` —
 * is only reachable through it. `hook-health/route.ts` logs exactly that.
 */
function flattenError(error: Error, depth = 0): Record<string, unknown> {
  const flat: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  // Depth-capped: a cause chain can be circular, and this runs inside an error
  // path where a stack overflow would replace the error being reported.
  if (error.cause !== undefined && depth < 3) {
    flat.cause =
      error.cause instanceof Error
        ? flattenError(error.cause, depth + 1)
        : error.cause;
  }
  return flat;
}

/**
 * Turn a console-style call into a wide event.
 *
 * This is the whole reason the facade exists rather than forwarding varargs.
 * A drain that receives `"Sync failed: 500 on product 180"` gives you a text
 * search; one that receives `{ action, message, entityId: 180, status: 500 }`
 * gives you a query. So each extra argument is sorted by what it is:
 *
 * - an `Error` becomes `error`, flattened — an Error's own fields are
 *   non-enumerable, so spreading one produces `{}` and loses the stack
 * - a plain object is spread into the event as queryable fields
 * - anything else (a string, a number, a Response) has no field name to go
 *   under, so it lands in `details` rather than being dropped
 *
 * The context goes under `tag` because that is the key evlog's own
 * `log.info(tag, message)` form writes. Using `action` here — which reads
 * better and is what evlog's wide-event examples use — would mean one logger
 * emitting the same value under two different keys depending on whether the
 * call happened to carry fields, and every drain query having to check both.
 *
 * `tag` and `message` are written last and win, so a caller passing
 * `{ message: "..." }` cannot blank out the line the log is about. What it
 * passed is not thrown away either — it moves to `shadowed`. Call sites hand
 * this function shapes they do not control (`llms.txt/route.ts` logs a rejected
 * promise's `reason`), and a rejection carrying its own `message` is the case
 * most worth reading.
 */
export function toEvent(
  context: string,
  message: string,
  args: unknown[]
): Record<string, unknown> {
  // Null prototype: `Object.assign` onto a normal object runs
  // `Object.prototype`'s `__proto__` setter, so a caller field by that name
  // disappears instead of being logged.
  const fields = Object.create(null) as Record<string, unknown>;
  const details: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      const flat = flattenError(arg);
      // A second error does not evict the first.
      if (fields.error === undefined) {
        fields.error = flat;
      } else {
        details.push(flat);
      }
    } else if (isPlainObject(arg)) {
      Object.assign(fields, arg);
    } else {
      details.push(arg);
    }
  }

  if (details.length > 0) {
    fields.details = details;
  }

  const shadowed: Record<string, unknown> = {};
  for (const key of RESERVED) {
    if (key in fields) {
      shadowed[key] = fields[key];
      delete fields[key];
    }
  }
  if (Object.keys(shadowed).length > 0) {
    fields.shadowed = shadowed;
  }

  return { ...fields, tag: context, message };
}

/**
 * Build the `Logger` class against one evlog entry point.
 *
 * The class keeps the shape it has always had — `new Logger("Context")` and
 * `info`/`warn`/`warning`/`error` — so the ~40 call sites across the monorepo
 * did not have to change when evlog replaced the console calls underneath.
 */
export function makeLogger(log: EvlogLog) {
  // `#` rather than `private`: the class is returned from a function, and
  // TypeScript refuses to emit a declaration for an anonymous class type that
  // carries `private` members.
  return class Logger {
    readonly #context: string;

    constructor(context: string) {
      this.#context = context;
    }

    #emit(level: LogLevel, message: string, args: unknown[]) {
      try {
        // No extra arguments means there are no fields to carry, and the
        // tag/message form prints better than a two-key event would.
        if (args.length === 0) {
          log[level](this.#context, message);
          return;
        }
        log[level](toEvent(this.#context, message, args));
      } catch {
        // Logging must not be the thing that throws. evlog serialises the event
        // with a bare `JSON.stringify`, so a circular reference or a BigInt in
        // a caller's object raises out of the `logger.error` call — usually
        // from inside a catch block, replacing the error being reported.
        // Measured with both pretty settings; `console.log` never did this.
        //
        // `llms.txt/route.ts` logs a rejected promise's `reason`, which can be
        // any value at all. Fall back to the shape this logger replaced.
        console.error(`[${this.#context}] ${level.toUpperCase()}: ${message}`);
      }
    }

    debug(message: string, ...args: unknown[]) {
      this.#emit("debug", message, args);
    }

    info(message: string, ...args: unknown[]) {
      this.#emit("info", message, args);
    }

    warn(message: string, ...args: unknown[]) {
      this.#emit("warn", message, args);
    }

    /** Kept because callers use both spellings. */
    warning(message: string, ...args: unknown[]) {
      this.#emit("warn", message, args);
    }

    error(message: string, ...args: unknown[]) {
      this.#emit("error", message, args);
    }
  };
}
