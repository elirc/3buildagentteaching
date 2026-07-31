import { createHash, randomUUID } from "node:crypto";
import type { AppEnvironment, LogLevel } from "@agentic-edu/shared";

export interface StructuredLogInput {
  service: string;
  environment?: AppEnvironment;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StructuredLogRecord extends Required<Omit<StructuredLogInput, "requestId" | "userId" | "entityType" | "entityId" | "metadata">> {
  id: string;
  timestamp: Date;
  requestId: string | null;
  userId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  fingerprint: string;
}

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AnomalyScoreInput {
  errorCount: number;
  warnCount: number;
  burstWindowMinutes: number;
  uniqueFingerprints: number;
}

export function createStructuredLog(input: StructuredLogInput): StructuredLogRecord {
  const environment = input.environment ?? "development";
  return {
    /*
     * randomUUID, not `Date.now()_Math.random()`. Two log lines written in the
     * same millisecond by two requests could collide on the old scheme, and a
     * collision here is not a cosmetic problem — the id is the primary key, so
     * the second write fails and the line is lost. Uniqueness is the whole job
     * of an id; Math.random is not in the business of guaranteeing it.
     */
    id: randomUUID(),
    timestamp: new Date(),
    service: input.service,
    environment,
    level: input.level,
    message: input.message,
    requestId: input.requestId ?? null,
    userId: input.userId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
    fingerprint: fingerprintLog(input.service, input.level, input.message, input.entityType)
  };
}

export function fingerprintLog(service: string, level: string, message: string, entityType?: string | null): string {
  const normalized = message
    .toLowerCase()
    .replace(/[0-9a-f]{8,}/g, "{id}")
    .replace(/\d+/g, "{n}");
  return createHash("sha1").update(`${service}:${level}:${entityType ?? "none"}:${normalized}`).digest("hex").slice(0, 12);
}

export function scoreOperationalAnomaly(input: AnomalyScoreInput): number {
  const burstFactor = input.burstWindowMinutes <= 10 ? 20 : 8;
  return Math.min(100, input.errorCount * 10 + input.warnCount * 3 + input.uniqueFingerprints * 4 + burstFactor);
}

/* ------------------------------------------------------------------ *
 * The runtime logger
 *
 * `createStructuredLog` builds a record. Nothing here persists one — this
 * package deliberately has no idea what a database is, which is why it can be
 * imported by any layer without dragging Prisma along. Persistence arrives as
 * a `LogSink` the caller supplies; the Prisma-backed one lives in
 * `packages/application`.
 * ------------------------------------------------------------------ */

export interface LogSink {
  write(record: StructuredLogRecord): void | Promise<void>;
}

export interface LoggerContext {
  service: string;
  environment?: AppEnvironment;
  /** Correlates every line written while handling one request. */
  requestId?: string | null;
  userId?: string | null;
}

export interface LogDetail {
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, detail?: LogDetail): void;
  info(message: string, detail?: LogDetail): void;
  warn(message: string, detail?: LogDetail): void;
  error(message: string, detail?: LogDetail): void;
  fatal(message: string, detail?: LogDetail): void;
  /** Narrows the context — same sink, extra fields. */
  child(context: Partial<LoggerContext>): Logger;
}

/**
 * Builds a logger that writes through `sink` and **never** throws at its caller.
 *
 * Two rules are doing all the work here, and both exist because of how logging
 * fails in production rather than how it looks in a demo:
 *
 * 1. **A log line must not be able to break the thing it is describing.** If the
 *    log table is full, the column too short, or the connection pool exhausted,
 *    the business operation must still succeed. So every write is wrapped, and a
 *    failure costs one `console.error` and nothing else.
 *
 * 2. **A rejected promise must be caught here, not by the process.** The methods
 *    return `void` — callers do not await them — so an async sink that rejects
 *    would surface as an unhandled rejection, which in modern Node terminates
 *    the process by default. A logger that can crash the app is worse than no
 *    logger. `.catch()` on the returned promise is the entire fix, and it is
 *    invisible in a code review unless you know to look for it.
 *
 * Note what is *not* here: no queue, no batching, no retry. A dropped log line
 * is an acceptable loss; a dropped grade is not, and the moment logging gets
 * durability machinery it starts competing for the resources of the work it is
 * supposed to be observing.
 */
export function createLogger(context: LoggerContext, sink: LogSink): Logger {
  const write = (level: LogLevel, message: string, detail: LogDetail = {}): void => {
    let record: StructuredLogRecord;
    try {
      record = createStructuredLog({
        service: context.service,
        environment: context.environment,
        level,
        message,
        requestId: context.requestId ?? undefined,
        userId: context.userId ?? undefined,
        entityType: detail.entityType,
        entityId: detail.entityId,
        metadata: detail.metadata
      });
    } catch (error) {
      reportLoggingFailure(error);
      return;
    }

    try {
      const result = sink.write(record);
      if (result && typeof (result as Promise<void>).catch === "function") {
        void (result as Promise<void>).catch(reportLoggingFailure);
      }
    } catch (error) {
      reportLoggingFailure(error);
    }
  };

  return {
    debug: (message, detail) => write("debug", message, detail),
    info: (message, detail) => write("info", message, detail),
    warn: (message, detail) => write("warn", message, detail),
    error: (message, detail) => write("error", message, detail),
    fatal: (message, detail) => write("fatal", message, detail),
    child: (extra) => createLogger({ ...context, ...extra }, sink)
  };
}

function reportLoggingFailure(error: unknown): void {
  // The one place console is the right answer: the logging path itself has
  // failed, so routing this through the logger would be a loop.
  console.error("[observability] log write failed", error);
}

/** Discards everything. For code paths with no sink configured. */
export const noopLogSink: LogSink = { write: () => undefined };

/** Collects records in memory. For tests and local inspection. */
export function createMemoryLogSink(): LogSink & { records: StructuredLogRecord[] } {
  const records: StructuredLogRecord[] = [];
  return {
    records,
    write: (record) => {
      records.push(record);
    }
  };
}

export function buildAuditMetadata(source: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source,
    recordedAt: new Date().toISOString(),
    ...extras
  };
}
