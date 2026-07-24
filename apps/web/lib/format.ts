import { labelFromEnum } from "@agentic-edu/shared";

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date));
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "Not set";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(date));
}

export function enumLabel(value: string | null | undefined): string {
  return value ? labelFromEnum(value) : "None";
}

export function toneForStatus(status: string): "neutral" | "good" | "warn" | "danger" | "info" {
  if (["Active", "Approved", "Completed", "Delivered", "Enrolled", "Passed", "Published", "Read", "Succeeded", "Present", "Excellent", "Good", "Low"].includes(status)) return "good";
  if (["Probation", "Proposed", "Queued", "Requested", "Waitlisted", "Draft", "Retrying", "Tardy", "Warning", "Medium", "OnLeave"].includes(status)) return "warn";
  if (["Withdrawn", "Rejected", "Inactive", "Cancelled", "Failed", "DeadLettered", "Absent", "AtRisk", "High", "Critical", "Missing"].includes(status)) return "danger";
  return "neutral";
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "No data";
  return `${Math.round(value)}%`;
}
