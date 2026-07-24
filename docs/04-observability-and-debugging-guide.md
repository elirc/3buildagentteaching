# Observability And Debugging Guide

The project includes three production-style operational surfaces: structured logs, audit events, and background jobs.

## Structured Logs

`StructuredLog` records include service, environment, level, message, request ID, user ID, entity reference, metadata, and fingerprint.

Use `/logs` to filter by service or level. Use `/logs/[id]` to inspect metadata and related fingerprints.

## Audit Events

`AuditEvent` records track major user/system actions with actor, action, entity, before snapshot, after snapshot, metadata, and timestamp.

Audit is written from server actions for teacher, student, course, section, enrollment, assignment, submission, attendance, support, intervention, job, and agent actions.

## Failed Jobs

`BackgroundJob` models queued, running, succeeded, failed, retrying, and dead-lettered work. `/jobs/[id]` includes retry, dead-letter, related logs, audit history, and failed-job agent investigation.

## Data Quality Issues

Common issues to inspect:

- missing grades
- impossible scores
- missing attendance records
- duplicate enrollment attempts
- inactive teachers assigned to sections
- malformed job payloads
- permission-denied logs

## Debugging Walkthrough

Example: attendance summary failed for Maya.

1. Open `/jobs/job_attendance_malformed`.
2. Read the error message and payload.
3. Inspect related logs.
4. Run the Failed Job Investigation Agent.
5. Open the created agent run and read input/output/trace.
6. Check `/students/student_maya` for attendance effects.
7. Check `/audit-events` for job and agent activity.
8. Decide whether to fix payload and retry or dead-letter.

The important habit: move from symptom to logs, then entity state, then audit history, then business rules.
