import { describe, expect, it, vi } from "vitest";
import {
  createLogger,
  createMemoryLogSink,
  createStructuredLog,
  fingerprintLog,
  scoreOperationalAnomaly,
  type LogSink
} from "./index";

describe("fingerprintLog", () => {
  it("groups messages that differ only in ids and numbers", () => {
    const first = fingerprintLog("attendance-service", "warn", "Student a1b2c3d4e5 has 3 absences", "Student");
    const second = fingerprintLog("attendance-service", "warn", "Student f6e5d4c3b2 has 11 absences", "Student");

    expect(first).toBe(second);
  });

  it("separates the same message coming from different services", () => {
    const fromAttendance = fingerprintLog("attendance-service", "warn", "Record refused", "Student");
    const fromEnrollment = fingerprintLog("enrollment-service", "warn", "Record refused", "Student");

    expect(fromAttendance).not.toBe(fromEnrollment);
  });

  it("separates levels, so a warn and an error never share a group", () => {
    expect(fingerprintLog("job-service", "warn", "Job failed")).not.toBe(
      fingerprintLog("job-service", "error", "Job failed")
    );
  });
});

describe("createStructuredLog", () => {
  it("gives every record a distinct id", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () =>
        createStructuredLog({ service: "test", level: "info", message: "Same message, same millisecond" }).id
      )
    );

    // The point of the assertion: 100 records built in a tight loop land in the
    // same millisecond, which is exactly where the old Date.now()-based id could
    // collide. Colliding ids mean a lost log line, not a cosmetic problem.
    expect(ids.size).toBe(100);
  });

  it("defaults environment to development and metadata to an empty object", () => {
    const record = createStructuredLog({ service: "test", level: "info", message: "Hello" });

    expect(record.environment).toBe("development");
    expect(record.metadata).toEqual({});
    expect(record.requestId).toBeNull();
  });
});

describe("createLogger", () => {
  it("writes one record per call, carrying the shared context", () => {
    const sink = createMemoryLogSink();
    const logger = createLogger({ service: "assignment-service", requestId: "req-1", userId: "user_admin" }, sink);

    logger.info("assignment-service.gradeSubmission succeeded", {
      entityType: "Submission",
      entityId: "sub_1",
      metadata: { score: 88 }
    });

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      service: "assignment-service",
      level: "info",
      requestId: "req-1",
      userId: "user_admin",
      entityId: "sub_1",
      metadata: { score: 88 }
    });
  });

  it("does not propagate a sink that throws synchronously", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const explodingSink: LogSink = {
      write: () => {
        throw new Error("log table is full");
      }
    };
    const logger = createLogger({ service: "attendance-service" }, explodingSink);

    // The assertion IS the requirement: a broken log sink must not become a
    // broken attendance write.
    expect(() => logger.error("attendance-service.recordAttendance failed")).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });

  it("swallows a sink that rejects asynchronously", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const rejectingSink: LogSink = { write: () => Promise.reject(new Error("connection pool exhausted")) };
    const logger = createLogger({ service: "job-service" }, rejectingSink);

    logger.warn("job-service.enqueue refused");
    // Let the rejection settle. Without the .catch() inside createLogger this is
    // an unhandled rejection, which terminates the process in current Node.
    await new Promise((resolve) => setImmediate(resolve));

    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("child() narrows the context without changing the sink", () => {
    const sink = createMemoryLogSink();
    const base = createLogger({ service: "worker-service", requestId: "req-9" }, sink);

    base.child({ userId: "user_manager" }).info("worker-service.runNextJob succeeded");

    expect(sink.records[0]).toMatchObject({ service: "worker-service", requestId: "req-9", userId: "user_manager" });
  });
});

describe("scoreOperationalAnomaly", () => {
  it("caps at 100 so a burst cannot produce an unbounded score", () => {
    expect(scoreOperationalAnomaly({ errorCount: 50, warnCount: 50, burstWindowMinutes: 5, uniqueFingerprints: 20 })).toBe(100);
  });
});
