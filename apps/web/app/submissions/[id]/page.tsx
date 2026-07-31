import { notFound } from "next/navigation";
import { Card, CardHeader, Field, JsonBlock, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { calculatePercentage, calculateRubricScore } from "@agentic-edu/domain";
import { AgentPanel } from "@/components/agent-panel";
import { getRunnableAgents } from "@/lib/agent-availability";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { getActorCapabilities } from "@/lib/capabilities";
import { formatDateTime, percent } from "@/lib/format";
import { gradeSubmission, gradeSubmissionWithRubric, runAssignmentFeedbackAgent } from "@/lib/actions";
import { guardStaffRecord } from "@/components/route-guard";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardStaffRecord();
  if (denied) return denied;

  const { id } = await params;
  const { can } = await getActorCapabilities();
  const runnable = await getRunnableAgents();

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      student: true,
      assignment: {
        include: {
          classSection: { include: { course: true, teacher: true } },
          rubric: { include: { criteria: { orderBy: { sortOrder: "asc" } } } }
        }
      },
      gradedByTeacher: true,
      criterionScores: true
    }
  });
  if (!submission) notFound();

  const latestRun = await prisma.agentRun.findFirst({
    where: { agentType: "AssignmentFeedback", targetType: "Submission", targetId: id },
    orderBy: { createdAt: "desc" }
  });

  const percentage = calculatePercentage(submission.score, submission.assignment.pointsPossible);
  const rubric = submission.assignment.rubric;
  const scoreByCriterion = new Map(submission.criterionScores.map((score) => [score.criterionId, score]));
  const canGrade = can("submission:grade", { teacherId: submission.assignment.classSection.teacherId });

  // Drives the "Criteria scored" stat, so a partially-graded submission reads as
  // unfinished rather than as a low mark.
  const rubricSummary = rubric
    ? calculateRubricScore(
        rubric.criteria.map((criterion) => ({
          id: criterion.id,
          title: criterion.title,
          pointsPossible: criterion.pointsPossible
        })),
        submission.criterionScores.map((score) => ({ criterionId: score.criterionId, score: score.score }))
      )
    : null;

  return (
    <>
      <PageHeader
        title={`Submission · ${submission.student.firstName} ${submission.student.lastName}`}
        description={`${submission.assignment.title} · ${submission.assignment.classSection.course.title}`}
        actions={<StatusBadge value={submission.status} />}
      />
      <div className="metric-row">
        <Stat label="Score" value={`${submission.score ?? "Ungraded"} / ${submission.assignment.pointsPossible}`} tone="info" />
        <Stat label="Percentage" value={percent(percentage)} tone={percentage !== null && percentage < 70 ? "danger" : "good"} />
        <Stat label="Submitted" value={formatDateTime(submission.submittedAt)} tone="neutral" />
        {rubric && rubricSummary ? (
          <Stat
            label="Criteria scored"
            value={`${rubric.criteria.length - rubricSummary.missingCriterionIds.length} of ${rubric.criteria.length}`}
            tone={rubricSummary.missingCriterionIds.length > 0 ? "warn" : "good"}
          />
        ) : null}
      </div>

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Submission Content" />
            <p>{submission.contentText ?? "No content submitted."}</p>
            {submission.attachmentUrl ? <p><strong>Attachment:</strong> {submission.attachmentUrl}</p> : null}
          </Card>

          <AgentPanel
            title="Assignment Feedback Agent Panel"
            available={runnable.has("AssignmentFeedback")}
            run={latestRun}
            action={
              can("agent:run") ? (
                <ActionForm action={runAssignmentFeedbackAgent}>
                  <input type="hidden" name="submissionId" value={submission.id} />
                  <SubmitButton variant="primary">Run feedback agent</SubmitButton>
                </ActionForm>
              ) : null
            }
          />

          <Card>
            <CardHeader title="Raw Submission Snapshot" />
            <JsonBlock value={submission} />
          </Card>
        </div>

        <Card>
          <CardHeader title="Grading View">
            {rubric
              ? `Scored against "${rubric.title}". The total is calculated from the criteria.`
              : "This assignment has no rubric, so the score is entered directly."}
          </CardHeader>

          {rubric ? (
            <ActionForm action={gradeSubmissionWithRubric} className="stack" errorPlacement="bottom">
              <input type="hidden" name="submissionId" value={submission.id} />
              <input type="hidden" name="gradedByTeacherId" value={submission.assignment.classSection.teacherId} />

              {rubric.criteria.map((criterion) => {
                const existing = scoreByCriterion.get(criterion.id);
                return (
                  <div key={criterion.id} className="ui-criterion">
                    <Field label={`${criterion.title} (max ${criterion.pointsPossible})`} hint={criterion.description}>
                      <input
                        name={`criterion_${criterion.id}`}
                        type="number"
                        step="0.5"
                        min="0"
                        max={criterion.pointsPossible}
                        /* Blank means "not scored yet", never zero. The action
                           skips empty values so a partial save stays partial. */
                        defaultValue={existing?.score ?? ""}
                        disabled={!canGrade}
                      />
                    </Field>
                    <Field label="Criterion feedback">
                      <textarea
                        name={`criterionFeedback_${criterion.id}`}
                        rows={2}
                        defaultValue={existing?.feedback ?? ""}
                        disabled={!canGrade}
                      />
                    </Field>
                  </div>
                );
              })}

              <p className="muted">
                Total possible {rubric.criteria.reduce((sum, criterion) => sum + criterion.pointsPossible, 0)} points.
                Leave a criterion blank to score it later.
              </p>

              <Field label="Overall feedback">
                <textarea name="feedback" defaultValue={submission.feedback ?? ""} disabled={!canGrade} />
              </Field>

              <SubmitButton variant="primary" disabled={!canGrade}>Save rubric scores</SubmitButton>
              {!canGrade ? <p className="muted">Grading is limited to this section&apos;s teacher and administrators.</p> : null}
            </ActionForm>
          ) : (
            <ActionForm action={gradeSubmission} className="stack" errorPlacement="bottom">
              <input type="hidden" name="id" value={submission.id} />
              <input type="hidden" name="gradedByTeacherId" value={submission.assignment.classSection.teacherId} />
              <Field label="Score">
                <input
                  name="score"
                  type="number"
                  step="0.5"
                  min="0"
                  max={submission.assignment.pointsPossible}
                  defaultValue={submission.score ?? ""}
                  required
                  disabled={!canGrade}
                />
              </Field>
              <Field label="Feedback">
                <textarea name="feedback" defaultValue={submission.feedback ?? ""} disabled={!canGrade} />
              </Field>
              <SubmitButton variant="primary" disabled={!canGrade}>Save grade</SubmitButton>
              {!canGrade ? <p className="muted">Grading is limited to this section&apos;s teacher and administrators.</p> : null}
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
