import { notFound } from "next/navigation";
import { Card, CardHeader, Field, JsonBlock, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { calculatePercentage } from "@agentic-edu/domain";
import { AgentPanel } from "@/components/agent-panel";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, percent } from "@/lib/format";
import { gradeSubmission, runAssignmentFeedbackAgent } from "@/lib/actions";

export default async function SubmissionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { student: true, assignment: { include: { classSection: { include: { course: true, teacher: true } } } }, gradedByTeacher: true }
  });
  if (!submission) notFound();
  const latestRun = await prisma.agentRun.findFirst({ where: { agentType: "AssignmentFeedback", targetType: "Submission", targetId: id }, orderBy: { createdAt: "desc" } });
  const percentage = calculatePercentage(submission.score, submission.assignment.pointsPossible);

  return (
    <>
      <PageHeader title={`Submission · ${submission.student.firstName} ${submission.student.lastName}`} description={`${submission.assignment.title} · ${submission.assignment.classSection.course.title}`} actions={<StatusBadge value={submission.status} />} />
      <div className="metric-row">
        <Stat label="Score" value={`${submission.score ?? "Ungraded"} / ${submission.assignment.pointsPossible}`} tone="info" />
        <Stat label="Percentage" value={percent(percentage)} tone={percentage !== null && percentage < 70 ? "danger" : "good"} />
        <Stat label="Submitted" value={formatDateTime(submission.submittedAt)} tone="neutral" />
      </div>
      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Submission Content" />
            <p>{submission.contentText ?? "No content submitted."}</p>
            {submission.attachmentUrl ? <p><strong>Attachment:</strong> {submission.attachmentUrl}</p> : null}
          </Card>
          <AgentPanel title="Assignment Feedback Agent Panel" run={latestRun} action={<form action={runAssignmentFeedbackAgent}><input type="hidden" name="submissionId" value={submission.id} /><button className="ui-button ui-button--primary" type="submit">Run feedback agent</button></form>} />
          <Card>
            <CardHeader title="Raw Submission Snapshot" />
            <JsonBlock value={submission} />
          </Card>
        </div>
        <Card>
          <CardHeader title="Grading View" />
          <form action={gradeSubmission} className="stack">
            <input type="hidden" name="id" value={submission.id} />
            <input type="hidden" name="gradedByTeacherId" value={submission.assignment.classSection.teacherId} />
            <Field label="Score"><input name="score" type="number" step="0.5" min="0" max={submission.assignment.pointsPossible} defaultValue={submission.score ?? ""} required /></Field>
            <Field label="Feedback"><textarea name="feedback" defaultValue={submission.feedback ?? ""} /></Field>
            <button className="ui-button ui-button--primary" type="submit">Save grade</button>
          </form>
        </Card>
      </div>
    </>
  );
}
