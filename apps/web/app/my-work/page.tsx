import { Card, CardHeader, DataTable, EmptyState, PageHeader, Stat } from "@agentic-edu/ui";
import { getTeacherWorkbench } from "@agentic-edu/application";
import { prisma } from "@agentic-edu/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { AgentPanel } from "@/components/agent-panel";
import { getRunnableAgents } from "@/lib/agent-availability";
import { getActorCapabilities } from "@/lib/capabilities";
import { formatDate } from "@/lib/format";
import { runTeacherWorkloadAgent } from "@/lib/actions";

/**
 * "What is waiting on me today."
 *
 * A Teacher sees their own sections. Admin and SchoolManager pick a teacher,
 * because the workload view is also how they spot someone drowning. Everyone
 * else is refused — this page is scoped to one person's work by construction,
 * and there is nothing meaningful to show a Student or a Guardian.
 */
export default async function MyWorkPage({
  searchParams
}: {
  searchParams?: Promise<{ teacherId?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const { actor, can } = await getActorCapabilities();
  const runnable = await getRunnableAgents();

  const isOperator = actor.role === "Admin" || actor.role === "SchoolManager";
  if (!actor.teacherId && !isOperator) {
    return (
      <>
        <PageHeader title="My work" description="Your grading queue and everything waiting on you." />
        <EmptyState title="You do not have access to this view">
          This page shows one teacher&apos;s workload. Switch to a Teacher, Admin or School Manager
          account using the user switcher in the top bar.
        </EmptyState>
      </>
    );
  }

  // A teacher always sees themselves. The ?teacherId param is only honoured for
  // operators — otherwise it would be a trivial way for one teacher to read
  // another's queue.
  const teachers = isOperator ? await prisma.teacher.findMany({ orderBy: { lastName: "asc" } }) : [];
  const teacherId = actor.teacherId ?? params.teacherId ?? teachers[0]?.id;

  if (!teacherId) {
    return (
      <>
        <PageHeader title="My work" />
        <EmptyState title="No teachers on file">Create a teacher record first.</EmptyState>
      </>
    );
  }

  const workbench = await getTeacherWorkbench(teacherId);
  if (!workbench) {
    return (
      <>
        <PageHeader title="My work" />
        <EmptyState title="Teacher not found">That teacher record no longer exists.</EmptyState>
      </>
    );
  }

  const { teacher, gradingQueue, metrics, overdueDrafts, publishedWithNoSubmissions, strugglingStudents, workload } =
    workbench;

  return (
    <>
      <PageHeader
        title="My work"
        description={`${teacher.firstName} ${teacher.lastName} · ${teacher.department} · ${workbench.sections.length} active section(s)`}
        actions={<StatusBadge value={workload.level} />}
      />

      {isOperator && teachers.length > 0 ? (
        <Card>
          <CardHeader title="Viewing" />
          <form className="form-grid" method="get">
            <label className="ui-field">
              <span>Teacher</span>
              <select name="teacherId" defaultValue={teacherId}>
                {teachers.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.firstName} {option.lastName}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="ui-button ui-button--secondary" type="submit">View</button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="metric-row">
        <Stat label="Ungraded submissions" value={metrics.ungradedCount} tone={metrics.ungradedCount > 0 ? "warn" : "good"} />
        <Stat label="Due this week" value={metrics.dueThisWeek} tone="info" />
        <Stat label="At-risk students" value={metrics.atRiskCount} tone={metrics.atRiskCount > 0 ? "danger" : "good"} />
        <Stat label="Failed jobs" value={metrics.failedJobs} tone={metrics.failedJobs > 0 ? "danger" : "good"} />
      </div>

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Grading queue">
              Ordered by urgency: how long it has waited, weighted by the student&apos;s risk level.
            </CardHeader>
            {gradingQueue.length === 0 ? (
              <EmptyState title="Nothing waiting">Every submitted assignment in your sections is graded.</EmptyState>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Assignment</th>
                    <th>Course</th>
                    <th>Waiting</th>
                    <th>Risk</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {gradingQueue.map((item) => (
                    <tr key={item.submissionId}>
                      <td>
                        <a href={`/students/${item.studentId}`}>{item.studentName}</a>
                      </td>
                      <td>{item.assignmentTitle}</td>
                      <td>{item.courseTitle}</td>
                      <td>{item.daysWaiting} day(s)</td>
                      <td>
                        {/* The badge is why the ordering is legible. Without it a
                            reader cannot tell why row 1 outranks row 2. */}
                        <StatusBadge value={item.riskLevel} />
                      </td>
                      <td>
                        <a className="ui-button ui-button--secondary" href={`/submissions/${item.submissionId}`}>
                          Grade
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          <Card>
            <CardHeader title="Needs attention" />
            {overdueDrafts.length === 0 && publishedWithNoSubmissions.length === 0 && strugglingStudents.length === 0 ? (
              <EmptyState title="Nothing flagged">No overdue drafts, empty assignments, or missing-work pile-ups.</EmptyState>
            ) : (
              <ul className="list">
                {overdueDrafts.map((assignment) => (
                  <li key={assignment.id}>
                    <strong>Still a draft, past due:</strong>{" "}
                    <a href={`/assignments/${assignment.id}`}>{assignment.title}</a> — due {formatDate(assignment.dueDate)}
                  </li>
                ))}
                {publishedWithNoSubmissions.map((assignment) => (
                  <li key={assignment.id}>
                    <strong>Published, no submissions:</strong>{" "}
                    <a href={`/assignments/${assignment.id}`}>{assignment.title}</a>
                  </li>
                ))}
                {strugglingStudents.map((entry) => (
                  <li key={entry.student.id}>
                    <strong>{entry.gradeSummary.missingCount} missing assignments:</strong>{" "}
                    <a href={`/students/${entry.student.id}`}>
                      {entry.student.firstName} {entry.student.lastName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Workload" />
            <div className="metric-row">
              <Stat label="Score" value={workload.score} tone={workload.score >= 60 ? "danger" : "good"} />
              <Stat label="Level" value={workload.level} tone={workload.score >= 60 ? "warn" : "good"} />
            </div>
            {workload.indicators.length > 0 ? (
              <ul className="list">
                {workload.indicators.map((indicator) => (
                  <li key={indicator}>{indicator}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">No overload indicators.</p>
            )}
          </Card>

          <AgentPanel
            title="Teacher Workload Insight Agent"
            available={runnable.has("TeacherWorkloadInsight")}
            action={
              can("agent:run", { teacherId }) ? (
                <ActionForm action={runTeacherWorkloadAgent}>
                  <input type="hidden" name="teacherId" value={teacherId} />
                  <SubmitButton variant="secondary">Run workload agent</SubmitButton>
                </ActionForm>
              ) : null
            }
          />
        </div>
      </div>
    </>
  );
}
