import { Card, CardHeader, DataTable, Field, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { createInterventionPlan, createSupportNote, updateInterventionStatus } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { guardRoute } from "@/components/route-guard";

export default async function InterventionsPage() {
  const denied = await guardRoute("/interventions");
  if (denied) return denied;

  const [plans, students] = await Promise.all([
    prisma.interventionPlan.findMany({ include: { student: true, createdBy: true }, orderBy: [{ status: "asc" }, { followUpDate: "asc" }] }),
    prisma.student.findMany({ orderBy: { lastName: "asc" } })
  ]);
  return (
    <>
      <PageHeader title="Intervention Plans" description="Support plans remain human-approved; agent recommendations do not automatically create plans." />
      <div className="split">
        <div className="stack">
          <Card>
            <CardHeader title="Plans" />
            <DataTable>
              <thead><tr><th>Student</th><th>Risk area</th><th>Status</th><th>Follow-up</th><th>Summary</th><th>Update</th></tr></thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td><a href={`/students/${plan.studentId}`}>{plan.student.firstName} {plan.student.lastName}</a></td>
                    <td>{plan.riskArea}</td>
                    <td><StatusBadge value={plan.status} /></td>
                    <td>{formatDate(plan.followUpDate)}</td>
                    <td>{plan.summary}</td>
                    <td>
                      <ActionForm action={updateInterventionStatus} className="ui-actions">
                        <input type="hidden" name="id" value={plan.id} />
                        <select name="status" defaultValue={plan.status}>
                          <option value="Draft">Draft</option><option value="Active">Active</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option>
                        </select>
                        <SubmitButton variant="secondary">Save</SubmitButton>
                      </ActionForm>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>
        <div className="stack">
          <Card>
            <CardHeader title="Create Intervention Plan" />
            <ActionForm action={createInterventionPlan} className="stack">
              <Field label="Student"><select name="studentId">{students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</select></Field>
              <Field label="Status"><select name="status" defaultValue="Active"><option value="Draft">Draft</option><option value="Active">Active</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></select></Field>
              <Field label="Risk area"><select name="riskArea"><option value="Grades">Grades</option><option value="Attendance">Attendance</option><option value="Engagement">Engagement</option><option value="Behavior">Behavior</option><option value="Other">Other</option></select></Field>
              <Field label="Summary"><textarea name="summary" required /></Field>
              <Field label="Recommended actions" hint="Comma-separated"><textarea name="recommendedActions" required /></Field>
              <Field label="Follow-up date"><input name="followUpDate" type="date" required /></Field>
              <SubmitButton variant="primary">Create plan</SubmitButton>
            </ActionForm>
          </Card>
          <Card>
            <CardHeader title="Create Support Note" />
            <ActionForm action={createSupportNote} className="stack">
              <Field label="Student"><select name="studentId">{students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</select></Field>
              <Field label="Visibility"><select name="visibility"><option value="Shared">Shared</option><option value="TeacherOnly">Teacher only</option><option value="AdvisorOnly">Advisor only</option><option value="AdminOnly">Admin only</option></select></Field>
              <Field label="Note type"><select name="noteType"><option value="Academic">Academic</option><option value="Attendance">Attendance</option><option value="Behavior">Behavior</option><option value="FamilyCommunication">Family communication</option><option value="Other">Other</option></select></Field>
              <Field label="Content"><textarea name="content" required /></Field>
              <SubmitButton variant="primary">Create note</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
