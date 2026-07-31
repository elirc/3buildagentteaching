import { notFound } from "next/navigation";
import { Badge, Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { getTeacherProfile } from "@agentic-edu/application";
import { AgentPanel } from "@/components/agent-panel";
import { getRunnableAgents } from "@/lib/agent-availability";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";
import { runTeacherWorkloadAgent, updateTeacher } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { guardStaffRecord } from "@/components/route-guard";

export default async function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardStaffRecord();
  if (denied) return denied;

  const { id } = await params;
  const runnable = await getRunnableAgents();
  const profile = await getTeacherProfile(id);
  if (!profile) notFound();
  const { activeSections, audits, latestRun, studentIds, teacher, ungraded, workload } = profile;

  return (
    <>
      <PageHeader
        title={`${teacher.firstName} ${teacher.lastName}`}
        description={`${teacher.department} · ${teacher.subjectsTaught.join(", ")}`}
        actions={<StatusBadge value={teacher.employmentStatus} />}
      />
      <div className="metric-row">
        <Stat label="Workload score" value={workload.score} tone={workload.score >= 70 ? "danger" : workload.score >= 50 ? "warn" : "good"} />
        <Stat label="Active sections" value={activeSections.length} tone="info" />
        <Stat label="Current students" value={studentIds.size} tone="info" />
        <Stat label="Ungraded submissions" value={ungraded} tone={ungraded > 0 ? "warn" : "good"} />
      </div>

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Assigned Class Sections" />
            <DataTable>
              <thead><tr><th>Course</th><th>Term</th><th>Status</th><th>Roster</th></tr></thead>
              <tbody>
                {teacher.sections.map((section) => (
                  <tr key={section.id}>
                    <td><a href={`/sections/${section.id}`}>{section.course.title}</a></td>
                    <td>{section.academicTerm.name}</td>
                    <td><StatusBadge value={section.status} /></td>
                    <td>{section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").length}/{section.capacity}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Current Students" />
            <ul className="list">
              {teacher.sections.flatMap((section) => section.enrollments).filter((enrollment) => enrollment.status === "Enrolled").map((enrollment) => (
                <li key={enrollment.id}>
                  <a href={`/students/${enrollment.student.id}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Teacher Activity Timeline" />
            <DataTable>
              <thead><tr><th>Date</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                {audits.map((event) => (
                  <tr key={event.id}><td>{formatDateTime(event.createdAt)}</td><td>{event.action}</td><td>{event.entityType}</td></tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Edit Teacher" />
            <ActionForm action={updateTeacher} className="stack">
              <input type="hidden" name="id" value={teacher.id} />
              <div className="form-grid">
                <Field label="First name"><input name="firstName" defaultValue={teacher.firstName} required /></Field>
                <Field label="Last name"><input name="lastName" defaultValue={teacher.lastName} required /></Field>
                <Field label="Email"><input name="email" defaultValue={teacher.email} type="email" required /></Field>
                <Field label="Department"><input name="department" defaultValue={teacher.department} required /></Field>
                <Field label="Employment status">
                  <select name="employmentStatus" defaultValue={teacher.employmentStatus}>
                    <option value="Active">Active</option>
                    <option value="OnLeave">On leave</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </Field>
                <Field label="Subjects taught"><input name="subjectsTaught" defaultValue={teacher.subjectsTaught.join(", ")} /></Field>
                <Field label="Office location"><input name="officeLocation" defaultValue={teacher.officeLocation ?? ""} /></Field>
              </div>
              <SubmitButton variant="primary">Save teacher</SubmitButton>
            </ActionForm>
          </Card>

          <AgentPanel
            title="Teacher Workload Agent Panel"
            available={runnable.has("TeacherWorkloadInsight")}
            run={latestRun}
            action={
              <ActionForm action={runTeacherWorkloadAgent}>
                <input type="hidden" name="teacherId" value={teacher.id} />
                <SubmitButton variant="primary">Run agent</SubmitButton>
              </ActionForm>
            }
          >
            <div className="ui-actions" style={{ justifyContent: "flex-start", marginBottom: "var(--space-3)" }}>
              {workload.indicators.map((indicator) => <Badge key={indicator} tone="warn">{indicator}</Badge>)}
            </div>
          </AgentPanel>
        </div>
      </div>
    </>
  );
}
