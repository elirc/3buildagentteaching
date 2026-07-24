import { Badge, Card, CardHeader, JsonBlock } from "@agentic-edu/ui";
import { formatDateTime } from "@/lib/format";

export function AgentPanel({
  title,
  run,
  action,
  children
}: {
  title: string;
  run?: {
    id: string;
    agentType: string;
    confidenceScore: number | null;
    createdAt: Date;
    output: unknown;
  } | null;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader title={title} eyebrow="Mock agent" actions={action}>
        Deterministic local analysis with persisted input, output, confidence, and trace.
      </CardHeader>
      {children}
      {run ? (
        <div className="stack">
          <div className="ui-actions" style={{ justifyContent: "flex-start" }}>
            <Badge tone="info">{run.agentType}</Badge>
            <Badge tone="neutral">Confidence {run.confidenceScore ? Math.round(run.confidenceScore) : "n/a"}%</Badge>
            <span className="muted">{formatDateTime(run.createdAt)}</span>
            <a className="ui-button ui-button--secondary" href={`/agent-runs/${run.id}`}>
              Open run
            </a>
          </div>
          <JsonBlock value={run.output} />
        </div>
      ) : (
        <p className="muted">No run has been recorded yet for this target.</p>
      )}
    </Card>
  );
}
