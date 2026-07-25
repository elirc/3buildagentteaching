import { Card, CardHeader, DataTable, PageHeader, Stat } from "@agentic-edu/ui";
import { getAgentOperationsOverview } from "@agentic-edu/application";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { guardRoute } from "@/components/route-guard";

export default async function AgentOpsPage() {
  const denied = await guardRoute("/agent-ops");
  if (denied) return denied;

  const overview = await getAgentOperationsOverview();

  return (
    <>
      <PageHeader title="Agent Operations" description="Phase 3 control surface for manifests, recommendations, evaluations, and worker-coupled agent runs." />
      <div className="ui-stat-grid">
        <Stat label="Active manifests" value={overview.metrics.activeManifests} tone="good" />
        <Stat label="Proposed recommendations" value={overview.metrics.proposedRecommendations} tone="warn" />
        <Stat label="Failed evals" value={overview.metrics.failedEvaluations} tone={overview.metrics.failedEvaluations > 0 ? "danger" : "good"} />
        <Stat label="Runnable jobs" value={overview.metrics.runnableJobs} />
      </div>

      <Card>
        <CardHeader title="Agent Manifests" actions={<a className="ui-button ui-button--secondary" href="/agent-recommendations">Review recommendations</a>} />
        <DataTable>
          <thead><tr><th>Agent</th><th>Version</th><th>Targets</th><th>Permissions</th><th>Status</th></tr></thead>
          <tbody>
            {overview.manifests.map((manifest) => (
              <tr key={manifest.id}>
                <td>{manifest.name}</td>
                <td>{manifest.version}</td>
                <td>{manifest.supportedTargets.join(", ")}</td>
                <td>{manifest.requiredPermissions.join(", ")}</td>
                <td><StatusBadge value={manifest.isActive ? "Active" : "Inactive"} /></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>

      <Card>
        <CardHeader title="Agent Evaluation Results" />
        <DataTable>
          <thead><tr><th>Fixture</th><th>Agent</th><th>Version</th><th>Passed</th><th>Score</th><th>Created</th></tr></thead>
          <tbody>
            {overview.evaluations.map((evaluation) => (
              <tr key={evaluation.id}>
                <td>{evaluation.fixtureName}</td>
                <td>{evaluation.agentType}</td>
                <td>{evaluation.version}</td>
                <td><StatusBadge value={evaluation.passed ? "Passed" : "Failed"} /></td>
                <td>{Math.round(evaluation.score * 100)}%</td>
                <td>{formatDateTime(evaluation.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>

      <Card>
        <CardHeader title="Recent Agent Runs" />
        <DataTable>
          <thead><tr><th>Run</th><th>Agent</th><th>Status</th><th>Target</th><th>Confidence</th><th>Created</th></tr></thead>
          <tbody>
            {overview.recentRuns.map((run) => (
              <tr key={run.id}>
                <td><a href={`/agent-runs/${run.id}`}>{run.id}</a></td>
                <td>{run.agentType} v{run.agentVersion ?? "unknown"}</td>
                <td><StatusBadge value={run.status} /></td>
                <td>{run.targetType}:{run.targetId}</td>
                <td>{run.confidenceScore ?? "No data"}</td>
                <td>{formatDateTime(run.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
