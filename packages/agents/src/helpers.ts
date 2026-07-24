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
