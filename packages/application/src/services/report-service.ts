import { prisma } from "@agentic-edu/db";
import { weeklyReportKey } from "@agentic-edu/domain";
import { assertCan, type ActorContext } from "../context";
import { withServiceLogging } from "../logging";
import { jobService } from "./job-service";

export const reportService = withServiceLogging("report-service", {
  /**
   * Queues a weekly risk report rather than generating one inline.
   *
   * Report generation reads every student's submissions, attendance,
   * interventions and support notes. That is fine at seed scale and is a
   * request-timeout at school scale, which is exactly the shape of work the job
   * queue exists for. The user gets a queued job immediately and the report
   * appears when the worker runs.
   *
   * The idempotency key carries the ISO week, so two people pressing "Generate
   * now" on Tuesday and Thursday enqueue the same key and get one job. The
   * handler independently anchors the report to the week's Monday, so even a
   * job that slips past the key — one enqueued after the first has already
   * succeeded — updates the existing report instead of adding a second.
   * Belt and braces, because the two mechanisms fail in different situations.
   */
  async requestWeeklyRiskReport(
    actor: ActorContext,
    input: { scopeType: "School" | "ClassSection" | "Advisor"; scopeId: string | null },
    now: Date = new Date()
  ) {
    // Reports aggregate every student in scope, so this is the same authority
    // that the at-risk queue itself requires, not a weaker "read a page" one.
    assertCan(actor, "intervention:create", { studentId: null });

    return jobService.enqueue(actor, {
      type: "ReportGeneration",
      payload: { report: "weekly-risk", scopeType: input.scopeType, scopeId: input.scopeId ?? undefined },
      idempotencyKey: weeklyReportKey(input.scopeId, now),
      relatedClassSectionId: input.scopeType === "ClassSection" ? input.scopeId : null
    });
  },

  /** Rows for the CSV export of a stored report. */
  async getReportPayload(actor: ActorContext, id: string) {
    assertCan(actor, "intervention:create", { studentId: null });
    return prisma.report.findUnique({ where: { id } });
  }
});
