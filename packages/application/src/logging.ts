import { Prisma, prisma } from "@agentic-edu/db";
import { createLogger, type LogSink, type Logger } from "@agentic-edu/observability";
import type { AppEnvironment } from "@agentic-edu/shared";
import type { ActorContext } from "./context";
import { AppError } from "./errors";

/* ------------------------------------------------------------------ *
 * The Prisma sink
 *
 * `packages/observability` builds log records and knows nothing about
 * storage. This is the half that writes them, and it lives here because
 * this is the lowest layer that is allowed to import Prisma.
 * ------------------------------------------------------------------ */

/**
 * In-flight writes, so `flushLogs()` can wait for them.
 *
 * Log writes are deliberately not awaited by the code being logged — see
 * `createLogger`. That makes them invisible to a test that wants to assert a
 * line was written, and to a script that wants to exit cleanly. Tracking the
 * promises costs one Set and turns "probably written by now" into "written".
 */
const pendingWrites = new Set<Promise<unknown>>();

export const prismaLogSink: LogSink = {
  write(record) {
    const write = prisma.structuredLog.create({
      data: {
        id: record.id,
        timestamp: record.timestamp,
        service: record.service,
        environment: record.environment,
        level: record.level,
        message: record.message,
        requestId: record.requestId,
        userId: record.userId,
        entityType: record.entityType,
        entityId: record.entityId,
        metadata: record.metadata as Prisma.InputJsonValue,
        fingerprint: record.fingerprint
      }
    });

    pendingWrites.add(write);
    // Two separate concerns: this `.catch` stops the *tracking* copy of the
    // promise from ever being an unhandled rejection, and the returned promise
    // is what createLogger attaches its own reporting `.catch` to.
    void write.catch(() => undefined).finally(() => pendingWrites.delete(write));

    return write.then(() => undefined);
  }
};

/**
 * Waits for every log write started so far.
 *
 * Call it in tests before asserting on `StructuredLog` rows, and anywhere a
 * process is about to exit. Uses `allSettled` because a failed log write is not
 * something a caller of `flushLogs` should have to handle — it has already been
 * reported once by the logger.
 */
export async function flushLogs(): Promise<void> {
  await Promise.allSettled([...pendingWrites]);
}

function resolveEnvironment(): AppEnvironment {
  const configured = process.env.APP_ENV ?? process.env.NODE_ENV;
  return configured === "production" || configured === "staging" ? configured : "development";
}

/** A logger bound to one service and, when known, one actor and request. */
export function serviceLogger(service: string, actor?: LoggingActor | null): Logger {
  return createLogger(
    {
      service,
      environment: resolveEnvironment(),
      requestId: actor?.requestId ?? null,
      userId: actor?.id ?? null
    },
    prismaLogSink
  );
}

type LoggingActor = Pick<ActorContext, "id"> & { requestId?: string | null };

/*
 * `never[]` rather than `any[]` in the constraint. A function of any shape is
 * assignable to `(...args: never[]) => ...` because parameters are
 * contravariant, so this accepts every service method without `any` appearing
 * anywhere — and the definition of done in CONTRIBUTING.md is explicit that
 * `any` is not the price of getting types to line up.
 */
type ServiceMethod = (...args: never[]) => Promise<unknown>;

/**
 * Wraps every method of a service object so it logs what happened.
 *
 * One `info` on success, one `warn` when the domain refused the call, one
 * `error` when something unexpected escaped. Three decisions are worth spelling
 * out, because each of them is a rule this codebase would otherwise break:
 *
 * **Messages are stable; the variable parts go in `metadata`.** The message is
 * always `"<service>.<method> <outcome>"` and never contains an id, a name or a
 * count. `fingerprintLog` groups logs by normalised message, so a message
 * carrying the student's name would produce one fingerprint group per student
 * and the /logs grouping panel would degrade into a list.
 *
 * **The wrapper is outside the transaction, by construction.** It only runs
 * once the service method — and therefore its `prisma.$transaction` callback —
 * has settled, so no log write can hold a transaction open or roll one back.
 * Getting this wrong is easy and the failure mode is horrible: a full log table
 * failing every write inside a transaction would fail every business write with
 * it. The corollary is that a nested service call logs on its own connection
 * while an outer transaction is still open, so a line can survive a rollback.
 * That is the intended trade: the log records what was attempted, and "we tried
 * and it was rolled back" is exactly what an on-call engineer needs to see.
 *
 * **`this` is bound to the unwrapped object.** `enrollmentService.bulkEnroll`
 * calls `this.enrollStudent`, and `workerService.runNextBatch` calls
 * `this.runNextJob`. Binding to the original literal means those internal calls
 * are not logged a second time — the wrapper logs the call the outside world
 * made, and a service talking to itself is an implementation detail. It also
 * avoids the trap that makes this pattern bite: calling `method(...args)`
 * unbound leaves `this` undefined in a module, and those two services would
 * throw at runtime while every type still checked.
 *
 * There is a typing consequence to that, and it is why two services here are
 * written as a named const that is wrapped afterwards rather than wrapped
 * inline. An object literal passed straight into this function is contextually
 * typed by `T`'s *constraint*, so inside it `this.runNextJob` resolves through
 * the index signature to `ServiceMethod | undefined` and calling it will not
 * compile. Naming the literal first removes the contextual type, `this` becomes
 * the literal's own type, and inference still produces the same `T` at the call
 * site. (`T & ThisType<T>` looks like the tidy fix and is not: inference from
 * an intersection containing `T` falls back to the constraint, which quietly
 * degrades every caller's types to `never`.)
 */
export function withServiceLogging<T extends Record<string, ServiceMethod>>(service: string, methods: T): T {
  const wrapped: Record<string, ServiceMethod> = {};

  for (const name of Object.keys(methods)) {
    const invoke = methods[name] as unknown as (...args: unknown[]) => Promise<unknown>;
    const operation = `${service}.${name}`;

    const logged = async (...args: unknown[]): Promise<unknown> => {
      const log = serviceLogger(service, actorFromArguments(args));
      try {
        const result = await invoke.apply(methods, args);
        log.info(`${operation} succeeded`, {
          entityId: entityIdOf(result),
          metadata: { operation }
        });
        return result;
      } catch (error) {
        if (error instanceof AppError) {
          /*
           * A refusal is not a fault. FORBIDDEN, CONFLICT and VALIDATION_ERROR
           * are the system working — someone asked for something the rules do
           * not allow — so they log at warn and an alert on error rates stays
           * meaningful. AppError.metadata is safe to log and unsafe to return:
           * actionFailure strips it before it reaches a form, and this is the
           * place it was collected for.
           */
          log.warn(`${operation} refused`, {
            metadata: { operation, code: error.code, ...error.metadata }
          });
        } else {
          log.error(`${operation} failed`, {
            metadata: { operation, error: describeError(error) }
          });
        }
        throw error;
      }
    };

    wrapped[name] = logged as unknown as ServiceMethod;
  }

  return wrapped as T;
}

/**
 * Every service method in this codebase takes the actor first. Rather than
 * making each of the thirteen services declare that again, the wrapper reads
 * the convention — and falls back to an anonymous logger when the first
 * argument is something else, so a method that breaks the convention loses the
 * user id rather than throwing.
 */
function actorFromArguments(args: unknown[]): LoggingActor | null {
  const first = args[0];
  if (typeof first !== "object" || first === null) return null;
  const candidate = first as { id?: unknown; role?: unknown; requestId?: unknown };
  if (typeof candidate.id !== "string" || typeof candidate.role !== "string") return null;
  return {
    id: candidate.id,
    requestId: typeof candidate.requestId === "string" ? candidate.requestId : null
  };
}

function entityIdOf(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return null;
  const candidate = result as { id?: unknown };
  return typeof candidate.id === "string" ? candidate.id : null;
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: "NonError", message: String(error) };
}
