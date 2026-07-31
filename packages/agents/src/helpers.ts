import { clamp } from "@agentic-edu/shared";
import type { AgentFinding, AgentRecommendation, AgentTraceStep } from "./types";

export function confidenceFromSignals(base: number, penalties: number[]): number {
  return clamp(Math.round(base - penalties.reduce((sum, penalty) => sum + penalty, 0)), 0, 100);
}

export function finding(severity: AgentFinding["severity"], title: string, evidence: string): AgentFinding {
  return { severity, title, evidence };
}

export function recommendation(
  owner: AgentRecommendation["owner"],
  action: string,
  priority: AgentRecommendation["priority"]
): AgentRecommendation {
  return { owner, action, priority };
}

export function trace(step: string, detail: string, scoreDelta?: number): AgentTraceStep {
  return { step, detail, scoreDelta };
}

export function nextFollowUpDate(days = 7): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Penalises a parent's confidence when the sub-agents it relied on were unsure.
 *
 * A review assembled from three shaky inputs should not report the same
 * confidence as one assembled from three solid ones. Before this the parent
 * simply asserted its own number, so "confidence 85" meant "the orchestration
 * logic is 85% sure", which is not the question anyone is asking — they want to
 * know whether to trust the plan, and a plan built on thin data is thin.
 *
 * The *minimum* child drives the penalty, not the mean. Averaging lets two
 * confident children hide one that had almost no data to work with, and that
 * one is the reason to be careful. A review is only as good as its weakest
 * input.
 *
 * The penalty is scaled rather than absolute: a child at 40 costs more than one
 * at 70, and a child at or above the parent costs nothing. Confidence never
 * increases — a sub-agent being sure is not evidence that the synthesis above
 * it is right.
 */
export function confidenceFromSubagents(base: number, childConfidences: number[]): number {
  if (childConfidences.length === 0) return clamp(Math.round(base), 0, 100);

  const weakest = Math.min(...childConfidences);
  if (weakest >= base) return clamp(Math.round(base), 0, 100);

  // Half the gap to the weakest child. Enough to be visible in the UI without
  // collapsing an otherwise sound review to nothing on one weak signal.
  const penalty = (base - weakest) / 2;
  return clamp(Math.round(base - penalty), 0, 100);
}
