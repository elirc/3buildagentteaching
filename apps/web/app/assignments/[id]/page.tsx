import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { calculatePercentage } from "@agentic-edu/domain";
import { AgentPanel } from "@/components/agent-panel";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, percent } from "@/lib/format";
import { createSubmission, publishAssignment, runGradingConsistencyAgent, updateAssignment } from "@/lib/actions";

export default async function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      classSection: { include: { course: true, enrollments: { include: { student: true } } } },
      createdByTeacher: true,
      submissions: { include: { student: true }, orderBy: { updatedAt: "desc" } },
      rubric: { include: { criteria: true } }
    }
  });
  if (!assignment) notFound();
  const gradingConsistencyRun = await prisma.agentRun.findFirst({
    where: { agentType: "GradingConsistency", targetId: assignment.id },
    orderBy: { createdAt: "desc" }
  });
  const scores = assignment.submissions.map((submission) => calculatePercentage(submission.score, assignment.pointsPossible)).filter((score): score is number => typeof score === "number");
  const average = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  const eligibleStudents = assignment.classSection.enrollments.filter((enrollment) => enrollment.status === "Enrolled");

  return (
    <>
      <PageHeader title={assignment.title} description={`${assignment.classSection.course.title} · due ${formatDate(assignment.dueDate)} · ${assignment.pointsPossible} points`} actions={<StatusBadge value={assignment.status} />} />
      <div className="metric-row">
        <Stat label="Average score" value={percent(average)} tone="info" />
        <Stat label="Submissions" value={assignment.submissions.length} tone="info" />
        <Stat label="Missing" value={assignment.submissions.filter((submission) => submission.status === "Missing").length} tone="warn" />
        <Stat label="Ungraded" value={assignment.submissions.filter((submission) => submission.score === null && submission.status !== "Missing").length} tone="warn" />
      </div>

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <Card>
          <CardHeader title="Submissions" actions={assignment.status === "Draft" ? <form action={publishAssignment}><input type="hidden" name="id" value={assignment.id} /><button className="ui-button ui-button--primary" type="submit">Publish</button></form> : null} />
          <DataTable>
            <thead><tr><th>Student</th><th>Status</th><th>Submitted</th><th>Score</th><th>Feedback</th></tr></thead>
            <tbody>
              {assignment.submissions.map((submission) => (
                <tr key={submission.id}>
                  <td><a href={`/submissions/${submission.id}`}>{submission.student.firstName} {submission.student.lastName}</a></td>
                  <td><StatusBadge value={submission.status} /></td>
                  <td>{formatDate(submission.submittedAt)}</td>
                  <td>{submission.score ?? "Ungraded"} / {assignment.pointsPossible}</td>
                  <td>{submission.feedback ?? "No feedback"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <div className="stack">
          <Card>
            <CardHeader title="Edit Assignment" />
            <form action={updateAssignment} className="stack">
              <input type="hidden" name="id" value={assignment.id} />
              <input type="hidden" name="classSectionId" value={assignment.classSectionId} />
              <input type="hidden" name="gradingPeriodId" value={assignment.gradingPeriodId ?? ""} />
              <input type="hidden" name="createdByTeacherId" value={assignment.createdByTeacherId} />
              <Field label="Title"><input name="title" defaultValue={assignment.title} required /></Field>
              <Field label="Type"><select name="type" defaultValue={assignment.type}><option value="Homework">Homework</option><option value="Quiz">Quiz</option><option value="Exam">Exam</option><option value="Project">Project</option><option value="Discussion">Discussion</option><option value="Lab">Lab</option><option value="Other">Other</option></select></Field>
              <Field label="Status"><select name="status" defaultValue={assignment.status}><option value="Draft">Draft</option><option value="Published">Published</option><option value="Closed">Closed</option></select></Field>
              <Field label="Due date"><input name="dueDate" type="date" defaultValue={assignment.dueDate.toISOString().slice(0, 10)} required /></Field>
              <Field label="Points possible"><input name="pointsPossible" type="number" min="1" step="0.5" defaultValue={assignment.pointsPossible} required /></Field>
              <Field label="Description"><textarea name="description" defaultValue={assignment.description} required /></Field>
              <button className="ui-button ui-button--primary" type="submit">Save assignment</button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Rubric" />
            {assignment.rubric ? (
              <DataTable>
                <thead><tr><th>Criterion</th><th>Description</th><th>Points</th></tr></thead>
                <tbody>
                  {assignment.rubric.criteria.map((criterion) => (
                    <tr key={criterion.id}><td>{criterion.title}</td><td>{criterion.description}</td><td>{criterion.pointsPossible}</td></tr>
                  ))}
                </tbody>
              </DataTable>
            ) : <p className="muted">No rubric attached.</p>}
          </Card>

          <AgentPanel
            title="Grading Consistency Agent"
            run={gradingConsistencyRun}
            action={<form action={runGradingConsistencyAgent}><input type="hidden" name="assignmentId" value={assignment.id} /><button className="ui-button ui-button--secondary" type="submit">Run grading check</button></form>}
          />

          <Card>
            <CardHeader title="Student Submission Form" />
            <form action={createSubmission} className="stack">
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <Field label="Student">
                <select name="studentId">
                  {eligibleStudents.map((enrollment) => <option key={enrollment.studentId} value={enrollment.studentId}>{enrollment.student.firstName} {enrollment.student.lastName}</option>)}
                </select>
              </Field>
              <Field label="Content"><textarea name="contentText" required /></Field>
              <Field label="Attachment URL"><input name="attachmentUrl" placeholder="/fake/local/file.pdf" /></Field>
              <button className="ui-button ui-button--primary" type="submit">Submit assignment</button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
