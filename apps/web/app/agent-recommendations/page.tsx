import { Card, CardHeader, DataTable, PageHeader, Stat } from "@agentic-edu/ui";
import { getAgentOperationsOverview } from "@agentic-edu/application";
import { decideAgentRecommendation } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export default async function AgentRecommendationsPage() {
  const overview = await getAgentOperationsOverview();

  return (
    <>
      <PageHeader title="Agent Recommendations" description="Human decision queue for deterministic agent suggestions." />
      <div className="ui-stat-grid">
        <Stat label="Proposed" value={overview.recommendations.filter((item) => item.status === "Proposed").length} tone="warn" />
        <Stat label="Approved" value={overview.recommendations.filter((item) => item.status === "Approved").length} tone="good" />
        <Stat label="Completed" value={overview.recommendations.filter((item) => item.status === "Completed").length} />
      </div>
      <Card>
        <CardHeader title="Recommendation Queue" />
        <DataTable>
          <thead><tr><th>Action</th><th>Owner</th><th>Priority</th><th>Status</th><th>Agent Run</th><th>Created</th><th>Decision</th></tr></thead>
          <tbody>
            {overview.recommendations.map((recommendation) => (
              <tr key={recommendation.id}>
                <td>{recommendation.action}<br /><small className="muted">{recommendation.rationale}</small></td>
                <td>{recommendation.ownerRole}</td>
                <td>{recommendation.priority}</td>
                <td><StatusBadge value={recommendation.status} /></td>
                <td><a href={`/agent-runs/${recommendation.agentRunId}`}>{recommendation.agentRun.agentType}</a></td>
                <td>{formatDateTime(recommendation.createdAt)}</td>
                <td>
                  <div className="ui-actions">
                    {recommendation.status === "Proposed" ? (
                      <>
                        <form action={decideAgentRecommendation}>
                          <input type="hidden" name="id" value={recommendation.id} />
                          <input type="hidden" name="status" value="Approved" />
                          <input type="hidden" name="rationale" value="Approved from recommendation queue." />
                          <button className="ui-button ui-button--secondary" type="submit">Approve</button>
                        </form>
                        <form action={decideAgentRecommendation}>
                          <input type="hidden" name="id" value={recommendation.id} />
                          <input type="hidden" name="status" value="Rejected" />
                          <input type="hidden" name="rationale" value="Rejected from recommendation queue." />
                          <button className="ui-button ui-button--danger" type="submit">Reject</button>
                        </form>
                      </>
                    ) : null}
                    {recommendation.status === "Approved" ? (
                      <form action={decideAgentRecommendation}>
                        <input type="hidden" name="id" value={recommendation.id} />
                        <input type="hidden" name="status" value="Completed" />
                        <input type="hidden" name="rationale" value="Completed from recommendation queue." />
                        <button className="ui-button ui-button--primary" type="submit">Complete</button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
