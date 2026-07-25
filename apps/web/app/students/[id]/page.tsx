import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { getStudentProfile } from "@agentic-edu/application";
import { AgentPanel } from "@/components/agent-panel";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatDateTime, percent } from "@/lib/format";
import {
  runAtRiskAgent,
  runGuardianCommunicationDraftAgent,
  runStudentProgressAgent,
  runStudentSuccessReviewAgent,
  updateStudent
} from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { guardStaffRecord } from "@/components/route-guard";

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardStaffRecord();
  if (denied) return denied;

  const { id } = await params;
  const profile = await getStudentProfile(id);
  if (!profile) notFound();
  const { advisors, attendanceSummary, audits, gradeSummary, guardianDraftRun, progressRun, risk, riskRun, student, successReviewRun } = profile;

  return (
    <>
      <PageHeader title={`${student.firstName} ${student.lastName}`} description={`Student ${student.studentNumber} · Grade ${student.gradeLevel} · Advisor ${student.advisor?.name ?? "Unassigned"}`} actions={<StatusBadge value={student.enrollmentStatus} />} />
      <div className="metric-row">
        <Stat label="Grade average" value={percent(gradeSummary.average)} tone={gradeSummary.average !== null && gradeSummary.average < 70 ? "danger" : "info"} />
        <Stat label="Missing assignments" value={gradeSummary.missingCount} tone={gradeSummary.missingCount > 0 ? "warn" : "good"} />
        <Stat label="Absences" value={attendanceSummary.absent} tone={attendanceSummary.absent >= 5 ? "danger" : "info"} />
        <Stat label="Risk score" value={`${risk.score} · ${risk.level}`} tone={risk.level === "High" || risk.level === "Critical" ? "danger" : "good"} />
      </div>

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Enrollments" />
            <DataTable>
              <thead><tr><th>Course</th><th>Teacher</th><th>Status</th><th>Term</th></tr></thead>
              <tbody>
                {student.enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td><a href={`/sections/${enrollment.classSection.id}`}>{enrollment.classSection.course.title}</a></td>
                    <td>{enrollment.classSection.teacher.firstName} {enrollment.classSection.teacher.lastName}</td>
                    <td><StatusBadge value={enrollment.status} /></td>
                    <td>{enrollment.classSection.term}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Assignment History" />
            <DataTable>
              <thead><tr><th>Assignment</th><th>Course</th><th>Status</th><th>Score</th><th>Feedback</th></tr></thead>
              <tbody>
                {student.submissions.map((submission) => (
                  <tr key={submission.id}>
                    <td><a href={`/submissions/${submission.id}`}>{submission.assignment.title}</a></td>
                    <td>{submission.assignment.classSection.course.title}</td>
                    <td><StatusBadge value={submission.status} /></td>
                    <td>{submission.score ?? "Ungraded"} / {submission.assignment.pointsPossible}</td>
                    <td>{submission.feedback ?? "No feedback yet"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Attendance Summary" />
            <DataTable>
              <thead><tr><th>Date</th><th>Course</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>
                {student.attendanceRecords.map((record) => (
                  <tr key={record.id}><td>{formatDate(record.date)}</td><td>{record.classSection.course.title}</td><td><StatusBadge value={record.status} /></td><td>{record.notes ?? ""}</td></tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Guardians" />
            <DataTable>
              <thead><tr><th>Name</th><th>Email</th><th>Relationship</th><th>Digest</th></tr></thead>
              <tbody>
                {student.guardians.map((link) => (
                  <tr key={link.id}>
                    <td>{link.guardian.firstName} {link.guardian.lastName}</td>
                    <td>{link.guardian.email}</td>
                    <td>{link.relationship}{link.isPrimary ? " primary" : ""}</td>
                    <td>{link.receivesDigest ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Intervention History" />
            <ul className="list">
              {student.interventionPlans.map((plan) => (
                <li key={plan.id}>
                  <strong>{plan.riskArea}</strong> · <StatusBadge value={plan.status} /> · Follow-up {formatDate(plan.followUpDate)}
                  <p>{plan.summary}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Student Notes" />
            <ul className="list">
              {student.supportNotes.map((note) => (
                <li key={note.id}>
                  <strong>{note.noteType}</strong> · {note.visibility} · {note.author.name}
                  <p>{note.content}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Student Audit History" />
            <DataTable>
              <thead><tr><th>When</th><th>Action</th><th>Entity</th></tr></thead>
              <tbody>
                {audits.map((event) => <tr key={event.id}><td>{formatDateTime(event.createdAt)}</td><td>{event.action}</td><td>{event.entityType}</td></tr>)}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Edit Student" />
            <ActionForm action={updateStudent} className="stack">
              <input type="hidden" name="id" value={student.id} />
              <div className="form-grid">
                <Field label="First name"><input name="firstName" defaultValue={student.firstName} required /></Field>
                <Field label="Last name"><input name="lastName" defaultValue={student.lastName} required /></Field>
                <Field label="Email"><input name="email" defaultValue={student.email} type="email" required /></Field>
                <Field label="Grade level"><input name="gradeLevel" defaultValue={student.gradeLevel} type="number" min="1" max="12" required /></Field>
                <Field label="Enrollment status">
                  <select name="enrollmentStatus" defaultValue={student.enrollmentStatus}>
                    <option value="Active">Active</option>
                    <option value="Probation">Probation</option>
                    <option value="Withdrawn">Withdrawn</option>
                    <option value="Graduated">Graduated</option>
                  </select>
                </Field>
                <Field label="Student number"><input name="studentNumber" defaultValue={student.studentNumber} required /></Field>
                <Field label="Guardian name"><input name="guardianName" defaultValue={student.guardianName} required /></Field>
                <Field label="Guardian email"><input name="guardianEmail" defaultValue={student.guardianEmail} type="email" required /></Field>
                <Field label="Advisor">
                  <select name="advisorId" defaultValue={student.advisorId ?? ""}>
                    <option value="">None</option>
                    {advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
                  </select>
                </Field>
              </div>
              <SubmitButton variant="primary">Save student</SubmitButton>
            </ActionForm>
          </Card>

          <AgentPanel
            title="Student Progress Agent Panel"
            run={progressRun}
            action={<ActionForm action={runStudentProgressAgent}><input type="hidden" name="studentId" value={student.id} /><SubmitButton variant="primary">Run progress agent</SubmitButton></ActionForm>}
          />
          <AgentPanel
            title="At-Risk Detection Agent Panel"
            run={riskRun}
            action={<ActionForm action={runAtRiskAgent}><input type="hidden" name="studentId" value={student.id} /><SubmitButton variant="primary">Run risk agent</SubmitButton></ActionForm>}
          />
          <AgentPanel
            title="Guardian Communication Draft Agent"
            run={guardianDraftRun}
            action={<ActionForm action={runGuardianCommunicationDraftAgent}><input type="hidden" name="studentId" value={student.id} /><SubmitButton variant="secondary">Draft guardian message</SubmitButton></ActionForm>}
          />
          <AgentPanel
            title="Student Success Review Agent"
            run={successReviewRun}
            action={<ActionForm action={runStudentSuccessReviewAgent}><input type="hidden" name="studentId" value={student.id} /><SubmitButton variant="secondary">Run success review</SubmitButton></ActionForm>}
          />
        </div>
      </div>
    </>
  );
}
