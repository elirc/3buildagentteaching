import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, EmptyState, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { getStudentAssignment } from "@agentic-edu/application";
import { calculatePercentage } from "@agentic-edu/domain";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { getActorCapabilities } from "@/lib/capabilities";
import { formatDate, formatDateTime, percent } from "@/lib/format";
import { createSubmission } from "@/lib/actions";

export default async function StudentAssignmentPage({
  params
}: {
  params: Promise<{ sectionId: string; assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const { actor } = await getActorCapabilities();

  if (!actor.studentId) {
    return (
      <>
        <PageHeader title="Assignment" />
        <EmptyState title="You do not have access to this view">This page is for students.</EmptyState>
      </>
    );
  }

  const data = await getStudentAssignment(actor, assignmentId);
  // Same response for "no such assignment" and "not one of yours", so this page
  // cannot be used to probe which assignment ids exist.
  if (!data) notFound();

  const { assignment, submission, submitDecision } = data;
  const percentage = calculatePercentage(submission?.score ?? null, assignment.pointsPossible);
  const isGraded = submission?.status === "Graded";

  return (
    <>
      <PageHeader
        title={assignment.title}
        description={`${assignment.classSection.course.title} · due ${formatDate(assignment.dueDate)} · ${assignment.pointsPossible} points`}
        actions={<StatusBadge value={submission?.status ?? "NotStarted"} />}
      />

      {isGraded ? (
        <div className="metric-row">
          <Stat label="Score" value={`${submission.score} / ${assignment.pointsPossible}`} tone="info" />
          <Stat label="Percentage" value={percent(percentage)} tone={percentage !== null && percentage < 70 ? "warn" : "good"} />
          <Stat label="Returned" value={formatDateTime(submission.gradedAt)} tone="neutral" />
        </div>
      ) : null}

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Instructions" />
            <p>{assignment.description}</p>
          </Card>

          {assignment.rubric ? (
            <Card>
              <CardHeader title={`Marked against: ${assignment.rubric.title}`}>
                Knowing the criteria before you start is the point of a rubric.
              </CardHeader>
              <DataTable>
                <thead><tr><th>Criterion</th><th>What it covers</th><th>Points</th>{isGraded ? <th>Your score</th> : null}</tr></thead>
                <tbody>
                  {assignment.rubric.criteria.map((criterion) => {
                    const score = submission?.criterionScores.find((s) => s.criterionId === criterion.id);
                    return (
                      <tr key={criterion.id}>
                        <td>{criterion.title}</td>
                        <td>{criterion.description}</td>
                        <td>{criterion.pointsPossible}</td>
                        {/* Per-criterion scores appear only once the work is
                            fully graded. A partially-scored submission would
                            otherwise show a student a mark that is going to
                            change. */}
                        {isGraded ? <td>{score ? `${score.score} / ${criterion.pointsPossible}` : "—"}</td> : null}
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </Card>
          ) : null}

          {isGraded && submission.feedback ? (
            <Card>
              <CardHeader title="Teacher feedback" />
              <p>{submission.feedback}</p>
              {submission.criterionScores.some((s) => s.feedback) ? (
                <ul className="list">
                  {submission.criterionScores
                    .filter((s) => s.feedback)
                    .map((s) => {
                      const criterion = assignment.rubric?.criteria.find((c) => c.id === s.criterionId);
                      return (
                        <li key={s.id}>
                          <strong>{criterion?.title ?? "Criterion"}:</strong> {s.feedback}
                        </li>
                      );
                    })}
                </ul>
              ) : null}
            </Card>
          ) : null}
        </div>

        <Card>
          <CardHeader title={submission?.submittedAt ? "Your submission" : "Hand in"}>
            {submission?.submittedAt ? `Submitted ${formatDateTime(submission.submittedAt)}.` : "Not handed in yet."}
          </CardHeader>

          {!submitDecision.allowed ? (
            <EmptyState title="Closed for submissions">{submitDecision.reason}</EmptyState>
          ) : isGraded ? (
            /* Resubmitting after grading would silently discard the teacher's
               mark and feedback. Out of scope here; ask the teacher to reopen. */
            <EmptyState title="Already graded">
              This work has been marked. Speak to your teacher if you need to resubmit.
            </EmptyState>
          ) : (
            <ActionForm action={createSubmission} className="stack" errorPlacement="bottom">
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <input type="hidden" name="studentId" value={actor.studentId} />
              <Field label="Your work">
                <textarea name="contentText" rows={10} defaultValue={submission?.contentText ?? ""} required />
              </Field>
              <Field label="Attachment link" hint="Optional. Paste a link to a document.">
                <input name="attachmentUrl" defaultValue={submission?.attachmentUrl ?? ""} />
              </Field>
              <SubmitButton variant="primary">
                {submission?.submittedAt ? "Replace my submission" : "Hand in"}
              </SubmitButton>
              {submission?.submittedAt ? (
                <p className="muted">This replaces your previous submission.</p>
              ) : null}
              {new Date() > assignment.dueDate ? (
                <p className="muted">This is past the due date and will be marked late.</p>
              ) : null}
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
