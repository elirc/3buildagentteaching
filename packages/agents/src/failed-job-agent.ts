import { confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, FailedJobInvestigationInput, FailedJobInvestigationOutput } from "./types";

export const failedJobInvestigationAgent: AgentDefinition<FailedJobInvestigationInput, FailedJobInvestigationOutput> = {
  type: "FailedJobInvestigation",
  name: "Failed Job Investigation Agent",
  description: "Explains failed background jobs using deterministic payload, attempt, and related-log heuristics.",
  targetTypes: ["Job"],
  run(input) {
    const error = input.job.errorMessage?.toLowerCase() ?? "";
    const evidence = [
      `Job ${input.job.id} is ${input.job.status} after ${input.job.attempts}/${input.job.maxAttempts} attempts.`,
      ...input.relatedLogs.slice(0, 3).map((log) => `${log.level}: ${log.message}`)
    ];
    let suspectedRootCause = "Unknown operational failure.";
    let retryRecommendation: FailedJobInvestigationOutput["retryRecommendation"] = "Retry";

    if (error.includes("payload") || error.includes("json") || error.includes("malformed")) {
      suspectedRootCause = "Invalid or malformed job payload.";
      retryRecommendation = "FixPayloadThenRetry";
    } else if (error.includes("permission") || error.includes("denied")) {
      suspectedRootCause = "Permission or RBAC failure.";
      retryRecommendation = "Escalate";
    } else if (error.includes("timeout") || error.includes("rate limit")) {
      suspectedRootCause = "Transient infrastructure or downstream timeout.";
      retryRecommendation = input.job.attempts >= input.job.maxAttempts ? "DeadLetter" : "Retry";
    }

    const output: FailedJobInvestigationOutput = {
      summary: `${input.job.type} failed with likely cause: ${suspectedRootCause}`,
      suspectedRootCause,
      retryRecommendation,
      evidence,
      nextActions:
        retryRecommendation === "FixPayloadThenRetry"
          ? ["Inspect job payload.", "Repair malformed fields.", "Retry after validation passes."]
          : retryRecommendation === "Escalate"
            ? ["Review actor permissions.", "Check recent RBAC changes.", "Escalate to platform owner."]
            : retryRecommendation === "DeadLetter"
              ? ["Move to dead-letter queue.", "Create follow-up ticket.", "Attach logs and payload snapshot."]
              : ["Retry job.", "Monitor related logs for repeat fingerprint."]
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(76, [input.job.errorMessage ? 0 : 20, input.relatedLogs.length === 0 ? 8 : 0]),
      findings: [finding(retryRecommendation === "Retry" ? "info" : "warning", "Job diagnosis", suspectedRootCause)],
      recommendations: [recommendation("System", output.nextActions[0] ?? "Investigate job.", retryRecommendation === "Retry" ? "medium" : "high")],
      limitations: ["Diagnosis is string-pattern based and should be confirmed by a human operator."],
      trace: [
        trace("attempts", `${input.job.attempts}/${input.job.maxAttempts} attempts used.`),
        trace("error-pattern", input.job.errorMessage ?? "No error message available."),
        trace("related-logs", `${input.relatedLogs.length} related log(s) included.`)
      ]
    };
  }
};
