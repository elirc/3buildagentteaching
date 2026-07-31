import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, JsonBlock, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { decideTermClosure, validateGradingPeriodWeights } from "@agentic-edu/domain";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { closeTerm } from "@/lib/actions";
import { formatDate, formatDateTime } from "@/lib/format";
import { guardRoute } from "@/components/route-guard";
import { getActorCapabilities } from "@/lib/capabilities";

export default async function TermDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardRoute("/terms");
  if (denied) return denied;

  const { id } = await params;
  const { can } = await getActorCapabilities();

  const term = await prisma.academicTerm.findUnique({
    where: { id },
    include: {
      gradingPeriods: { orderBy: { startsAt: "asc" } },
      sections: {
        include: {
          course: true,
          teacher: true,
          assignments: { include: { submissions: { include: { student: true, assignment: true } } } }
        }
      }
    }
  });
  if (!term) notFound();

  const postmortem = await prisma.agentRun.findFirst({
    where: { agentType: "TermPostmortem", targetId: id },
    orderBy: { createdAt: "desc" }
  });

  /*
   * The same rule the service enforces, evaluated here to decide what to show.
   * The page does not decide anything — closeTerm re-reads and re-checks — but
   * listing the blocking submissions is far more useful than a refused click
   * that says "4 submissions are ungraded" without saying which.
   */
  const ungraded = term.sections
    .flatMap((section) => section.assignments)
    .flatMap((assignment) => assignment.submissions)
    .filter((submission) => submission.status === "Submitted" || submission.status === "Late");
  const closure = decideTermClosure({ ungradedCount: ungraded.length, status: term.status });
  const weightReport = validateGradingPeriodWeights(term.gradingPeriods.map((period) => ({ name: period.name, weight: period.weight })));

  return (
    <>
      <PageHeader
        title={term.name}
        description={`${formatDate(term.startsAt)} to ${formatDate(term.endsAt)} · ${term.sections.length} section(s)`}
        actions={<StatusBadge value={term.status} />}
      />

      <div className="ui-stat-grid">
        <Stat label="Sections" value={term.sections.length} />
        <Stat label="Grading periods" value={term.gradingPeriods.length} />
        <Stat label="Ungraded submissions" value={ungraded.length} tone={ungraded.length > 0 ? "warn" : "good"} />
        <Stat label="Postmortem" value={postmortem ? "Run" : "None"} />
      </div>

      {weightReport.valid ? null : <p className="form-error" role="alert"><strong>Check this:</strong> {weightReport.reason}</p>}

      <Card>
        <CardHeader title="Close term" />
        <p className="muted">
          Closing runs the Term Postmortem agent and then sets the term to Closed. It is refused while any submission is
          ungraded — a term whose grades are not final cannot be closed honestly, and once closed the numbers are the
          record.
        </p>
        {closure.allowed ? null : (
          <p className="form-error" role="alert"><strong>Cannot do that right now:</strong> {closure.reason}</p>
        )}
        {ungraded.length > 0 ? (
          <DataTable>
            <thead><tr><th>Student</th><th>Assignment</th><th>Status</th></tr></thead>
            <tbody>
              {/* Named, not counted. "4 submissions are ungraded" tells a
                  manager they are blocked; naming them tells them what to do. */}
              {ungraded.slice(0, 25).map((submission) => (
                <tr key={submission.id}>
                  <td>{submission.student.firstName} {submission.student.lastName}</td>
                  <td><a href={`/submissions/${submission.id}`}>{submission.assignment.title}</a></td>
                  <td><StatusBadge value={submission.status} /></td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
        {can("term:manage") ? (
          <ActionForm action={closeTerm} errorPlacement="bottom">
            <input type="hidden" name="termId" value={term.id} />
            <SubmitButton variant="danger" pendingLabel="Closing…" disabled={!closure.allowed}>
              Close term
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="muted">Closing a term requires <code>term:manage</code>.</p>
        )}
      </Card>

      {postmortem ? (
        <Card>
          <CardHeader
            title="Term Postmortem"
            eyebrow={`${postmortem.agentType} v${postmortem.agentVersion ?? "unknown"}`}
            actions={<a className="ui-button ui-button--secondary" href={`/agent-runs/${postmortem.id}`}>Open run</a>}
          >
            Confidence {postmortem.confidenceScore ? Math.round(postmortem.confidenceScore) : "n/a"}% · {formatDateTime(postmortem.createdAt)}
          </CardHeader>
          <JsonBlock value={postmortem.output ?? { error: postmortem.errorMessage }} />
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Sections" />
        <DataTable>
          <thead><tr><th>Course</th><th>Teacher</th><th>Room</th><th>Assignments</th></tr></thead>
          <tbody>
            {term.sections.map((section) => (
              <tr key={section.id}>
                <td><a href={`/sections/${section.id}`}>{section.course.code} — {section.course.title}</a></td>
                <td>{section.teacher.firstName} {section.teacher.lastName}</td>
                <td>{section.room}</td>
                <td>{section.assignments.length}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
