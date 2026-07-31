import { Badge, Card, CardHeader, JsonBlock } from "@agentic-edu/ui";
import { formatDateTime } from "@/lib/format";

export function AgentPanel({
  title,
  run,
  action,
  available = true,
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
  /**
   * False when this agent has no active manifest (US-17).
   *
   * The control is replaced with an explanation rather than silently removed:
   * an operator who deactivated the agent should recognise the consequence of
   * what they did, and everyone else should learn why the button they remember
   * is gone. A vanished button is a support ticket.
   */
  available?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        title={title}
        eyebrow="Mock agent"
        actions={available ? action : <span className="ui-badge">Deactivated</span>}
      >
        Deterministic local analysis with persisted input, output, confidence, and trace.
      </CardHeader>
      {available ? null : (
        <p className="muted">
          This agent has no active manifest, so it will refuse to run. An admin can re-activate it on{" "}
          <a href="/agent-ops">Agent Ops</a>.
        </p>
      )}
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
