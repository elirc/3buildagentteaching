import { createHash } from "node:crypto";
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
    id: `log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
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

export function buildAuditMetadata(source: string, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source,
    recordedAt: new Date().toISOString(),
    ...extras
  };
}
