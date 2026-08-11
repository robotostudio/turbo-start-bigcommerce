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
  const fields: Record<string, unknown> = {};
  const details: unknown[] = [];

  for (const arg of args) {
    if (arg instanceof Error) {
      fields.error = {
        name: arg.name,
        message: arg.message,
        stack: arg.stack,
      };
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
  for (const key of ["tag", "message"]) {
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
      // No extra arguments means there are no fields to carry, and the
      // tag/message form prints better than a two-key event would.
      if (args.length === 0) {
        log[level](this.#context, message);
        return;
      }
      log[level](toEvent(this.#context, message, args));
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
