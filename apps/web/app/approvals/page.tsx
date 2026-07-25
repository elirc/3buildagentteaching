import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { getAcademicOperationsOverview } from "@agentic-edu/application";
import { decideInterventionApproval, requestInterventionApproval } from "@/lib/actions";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { guardRoute } from "@/components/route-guard";

export default async function ApprovalsPage() {
  const denied = await guardRoute("/approvals");
  if (denied) return denied;

  const [overview, plans] = await Promise.all([
    getAcademicOperationsOverview(),
    prisma.interventionPlan.findMany({ include: { student: true }, orderBy: { createdAt: "desc" } })
  ]);

  return (
    <>
      <PageHeader title="Intervention Approvals" description="Human approval workflow for support plans and agent-suggested interventions." />
      <div className="ui-stat-grid">
        <Stat label="Pending" value={overview.metrics.pendingApprovals} tone={overview.metrics.pendingApprovals > 0 ? "warn" : "good"} />
        <Stat label="Approved" value={overview.approvals.filter((approval) => approval.status === "Approved").length} tone="good" />
        <Stat label="Rejected" value={overview.approvals.filter((approval) => approval.status === "Rejected").length} tone="danger" />
      </div>

      <Card>
        <CardHeader title="Request Approval" />
        <ActionForm action={requestInterventionApproval} className="ui-form-grid">
          <Field label="Intervention plan">
            <select name="interventionPlanId">
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.student.firstName} {plan.student.lastName}: {plan.summary}</option>)}
            </select>
          </Field>
          <SubmitButton variant="primary">Request approval</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Approval Queue" />
        <DataTable>
          <thead><tr><th>Student</th><th>Plan</th><th>Status</th><th>Requested by</th><th>Reviewed by</th><th>Created</th><th>Decision</th></tr></thead>
          <tbody>
            {overview.approvals.map((approval) => (
              <tr key={approval.id}>
                <td>{approval.interventionPlan.student.firstName} {approval.interventionPlan.student.lastName}</td>
                <td>{approval.interventionPlan.summary}</td>
                <td><StatusBadge value={approval.status} /></td>
                <td>{approval.requestedBy.name}</td>
                <td>{approval.reviewedBy?.name ?? "Pending"}</td>
                <td>{formatDateTime(approval.createdAt)}</td>
                <td>
                  {approval.status === "Requested" ? (
                    <div className="ui-actions">
                      <ActionForm action={decideInterventionApproval}>
                        <input type="hidden" name="id" value={approval.id} />
                        <input type="hidden" name="status" value="Approved" />
                        <input type="hidden" name="rationale" value="Reviewed from approvals page." />
                        <SubmitButton variant="secondary">Approve</SubmitButton>
                      </ActionForm>
                      <ActionForm action={decideInterventionApproval}>
                        <input type="hidden" name="id" value={approval.id} />
                        <input type="hidden" name="status" value="Rejected" />
                        <input type="hidden" name="rationale" value="Rejected from approvals page." />
                        <SubmitButton variant="danger">Reject</SubmitButton>
                      </ActionForm>
                    </div>
                  ) : approval.rationale ?? "Decided"}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
