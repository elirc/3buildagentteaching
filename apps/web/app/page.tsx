import { Card, CardHeader, DataTable, LinkButton, PageHeader, Stat } from "@agentic-edu/ui";
import { getDashboardSummary } from "@agentic-edu/application";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, percent } from "@/lib/format";

export default async function DashboardPage() {
  const { agentRuns, auditEvents, classAverage, metrics, riskBoardTruncated, studentRisk, workloadAlerts } =
    await getDashboardSummary();

  return (
    <>
      <PageHeader
        title="Education Operations Dashboard"
        description="Academic, operational, and agent-powered signals for the seeded Northstar Academy scenario."
        actions={<LinkButton href="/agent-runs">Agent history</LinkButton>}
      />

      <div className="metric-row">
        <Stat label="Active students" value={metrics.activeStudents} tone="info" />
        <Stat label="Active teachers" value={metrics.activeTeachers} tone="good" />
        <Stat label="Active sections" value={metrics.activeSections} tone="info" />
        <Stat label="Students at risk" value={metrics.atRiskStudents} tone={metrics.atRiskStudents > 0 ? "danger" : "good"} />
        <Stat label="Missing assignments" value={metrics.missingAssignments} tone={metrics.missingAssignments > 0 ? "warn" : "good"} />
        <Stat label="Attendance concerns" value={metrics.attendanceConcerns} tone={metrics.attendanceConcerns > 0 ? "danger" : "good"} />
        <Stat label="Ungraded submissions" value={metrics.ungradedSubmissions} tone={metrics.ungradedSubmissions > 0 ? "warn" : "good"} />
        <Stat label="Failed jobs" value={metrics.failedJobs} tone={metrics.failedJobs > 0 ? "danger" : "good"} />
      </div>

      <div className="grid grid-2" style={{ marginTop: "var(--space-4)" }}>
        <Card>
          <CardHeader title="Latest Agent Findings" />
          <DataTable>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Target</th>
                <th>Confidence</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {agentRuns.map((run) => (
                <tr key={run.id}>
                  <td>
                    <a href={`/agent-runs/${run.id}`}>{run.agentType}</a>
                  </td>
                  <td>
                    {run.targetType} {run.targetId}
                  </td>
                  <td>{run.confidenceScore ? `${Math.round(run.confidenceScore)}%` : "n/a"}</td>
                  <td>{formatDateTime(run.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card>
          <CardHeader title="Grade Distribution Summary">
            {riskBoardTruncated
              ? "Across the 50 students loaded for the risk board, not the whole school."
              : "Across all active students."}
          </CardHeader>
          <div className="metric-row">
            <Stat label="Overall average" value={percent(classAverage)} tone="info" />
            <Stat label="Excellent" value={studentRisk.filter((item) => item.gradeSummary.performanceBand === "Excellent").length} tone="good" />
            <Stat label="Warning" value={studentRisk.filter((item) => item.gradeSummary.performanceBand === "Warning").length} tone="warn" />
            <Stat label="At risk" value={studentRisk.filter((item) => item.gradeSummary.performanceBand === "AtRisk").length} tone="danger" />
          </div>
        </Card>
      </div>

      <div className="grid grid-2" style={{ marginTop: "var(--space-4)" }}>
        <Card>
          <CardHeader title="Teacher Workload Alerts" actions={<LinkButton href="/teachers">Teachers</LinkButton>} />
          <DataTable>
            <thead>
              <tr>
                <th>Teacher</th>
                <th>Score</th>
                <th>Level</th>
              </tr>
            </thead>
            <tbody>
              {workloadAlerts.map((item) => (
                <tr key={item.teacher.id}>
                  <td>
                    <a href={`/teachers/${item.teacher.id}`}>
                      {item.teacher.firstName} {item.teacher.lastName}
                    </a>
                  </td>
                  <td>{item.workload.score}</td>
                  <td>
                    <StatusBadge value={item.workload.level} />
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card>
          <CardHeader title="Recent Audit Events" actions={<LinkButton href="/audit-events">Audit log</LinkButton>} />
          <DataTable>
            <thead>
              <tr>
                <th>Action</th>
                <th>Entity</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((event) => (
                <tr key={event.id}>
                  <td>{event.action}</td>
                  <td>
                    {event.entityType} {event.entityId}
                  </td>
                  <td>{formatDateTime(event.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
      </div>
    </>
  );
}
