import { Badge } from "@agentic-edu/ui";
import { enumLabel, toneForStatus } from "@/lib/format";

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={toneForStatus(value)}>{enumLabel(value)}</Badge>;
}
