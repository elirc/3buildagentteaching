import { Card, CardHeader, DataTable, PageHeader, Stat } from "@agentic-edu/ui";
import { getAgentOperationsOverview } from "@agentic-edu/application";
import { agentRegistry } from "@agentic-edu/agents";
import { selectActiveVersion } from "@agentic-edu/domain";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { setManifestActive } from "@/lib/actions";
import { guardRoute } from "@/components/route-guard";
import { getActorCapabilities } from "@/lib/capabilities";

export default async function AgentOpsPage() {
  const denied = await guardRoute("/agent-ops");
  if (denied) return denied;

  const overview = await getAgentOperationsOverview();
  const { can } = await getActorCapabilities();
  const canManageManifests = can("agentManifest:manage");

  /*
   * Which version each agent is actually serving, computed with the same
   * function the gate uses. Rendering the list without this leaves the reader
   * to work out that 1.0.10 beats 1.0.9 — which is exactly the comparison a
   * string sort gets wrong.
   */
  const activeVersions = new Map<string, string>();
  for (const agentType of Object.keys(agentRegistry)) {
    const active = selectActiveVersion(overview.manifests.filter((manifest) => manifest.agentType === agentType));
    if (active) activeVersions.set(agentType, active.version);
  }
  const missingManifests = Object.keys(agentRegistry).filter((agentType) => !activeVersions.has(agentType));

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
        <p className="muted">
          A manifest is now enforced, not described. Deactivating the only active version of an agent makes it refuse to
          run — no <code>AgentRun</code> row is created — and its run buttons stop being offered across the app.
        </p>
        <DataTable>
          <thead><tr><th>Agent</th><th>Version</th><th>Targets</th><th>Permissions</th><th>Status</th><th /></tr></thead>
          <tbody>
            {overview.manifests.map((manifest) => (
              <tr key={manifest.id}>
                <td>{manifest.name}</td>
                <td>
                  {manifest.version}
                  {/* Which version *wins* is not obvious when several exist, and
                      getting it wrong is silent: the wrong version produces
                      plausible output rather than an error. */}
                  {activeVersions.get(manifest.agentType) === manifest.version && manifest.isActive
                    ? <> <span className="ui-badge ui-badge--good">serving</span></>
                    : null}
                </td>
                <td>{manifest.supportedTargets.join(", ")}</td>
                <td>{manifest.requiredPermissions.join(", ")}</td>
                <td><StatusBadge value={manifest.isActive ? "Active" : "Inactive"} /></td>
                <td>
                  {canManageManifests ? (
                    <ActionForm action={setManifestActive}>
                      <input type="hidden" name="manifestId" value={manifest.id} />
                      <input type="hidden" name="isActive" value={manifest.isActive ? "false" : "true"} />
                      <SubmitButton variant={manifest.isActive ? "danger" : "primary"} pendingLabel="Saving…">
                        {manifest.isActive ? "Deactivate" : "Activate"}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>

      {missingManifests.length > 0 ? (
        <Card>
          <CardHeader title="Agents with no active manifest" />
          {/* The registry is exhaustive by construction (satisfies
              Record<AgentType, ...>); the manifest table is data and can drift
              from it. Anything listed here will refuse to run. */}
          <p className="form-error" role="alert">
            <strong>These agents will refuse to run:</strong> {missingManifests.join(", ")}
          </p>
        </Card>
      ) : null}

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
