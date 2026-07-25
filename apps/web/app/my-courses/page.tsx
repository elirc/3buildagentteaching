import { Card, CardHeader, DataTable, EmptyState, PageHeader, Stat } from "@agentic-edu/ui";
import { getStudentCourses } from "@agentic-edu/application";
import { StatusBadge } from "@/components/status-badge";
import { getActorCapabilities } from "@/lib/capabilities";
import { formatDate, percent } from "@/lib/format";

export default async function MyCoursesPage() {
  const { actor } = await getActorCapabilities();
  const data = await getStudentCourses(actor);

  if (!data) {
    return (
      <>
        <PageHeader title="My courses" description="Your classes, work, and grades." />
        <EmptyState title="You do not have access to this view">
          This page is for students. Switch accounts using the user switcher in the top bar.
        </EmptyState>
      </>
    );
  }

  const { student, courses } = data;
  const overall = courses.flatMap((course) => course.work);
  const outstanding = overall.filter(
    ({ assignment, submission }) => assignment.status === "Published" && !submission?.submittedAt
  );

  return (
    <>
      <PageHeader
        title="My courses"
        description={`${student.firstName} ${student.lastName} · Grade ${student.gradeLevel}`}
      />

      <div className="metric-row">
        <Stat label="Courses" value={courses.length} tone="info" />
        <Stat label="Not yet handed in" value={outstanding.length} tone={outstanding.length > 0 ? "warn" : "good"} />
        <Stat
          label="Graded"
          value={overall.filter(({ submission }) => submission?.status === "Graded").length}
          tone="good"
        />
      </div>

      <div className="stack" style={{ marginTop: "var(--space-4)" }}>
        {courses.length === 0 ? (
          <EmptyState title="No enrolled courses">Speak to the school office about your timetable.</EmptyState>
        ) : (
          courses.map(({ enrollment, section, work, summary }) => (
            <Card key={enrollment.id}>
              <CardHeader
                title={section.course.title}
                eyebrow={`${section.teacher.firstName} ${section.teacher.lastName} · Room ${section.room}`}
              >
                {/* Their own average only. There is deliberately no class
                    average anywhere on this page — a student comparing
                    themselves to their classmates is not something the product
                    should be building for them. */}
                Your average: {percent(summary.average)}
              </CardHeader>
              <DataTable>
                <thead>
                  <tr><th>Assignment</th><th>Due</th><th>Status</th><th>Score</th><th></th></tr>
                </thead>
                <tbody>
                  {work.map(({ assignment, submission }) => (
                    <tr key={assignment.id}>
                      <td>{assignment.title}</td>
                      <td>{formatDate(assignment.dueDate)}</td>
                      <td>
                        <StatusBadge value={submission?.status ?? "NotStarted"} />
                      </td>
                      <td>
                        {submission?.status === "Graded"
                          ? `${submission.score} / ${assignment.pointsPossible}`
                          : "—"}
                      </td>
                      <td>
                        <a
                          className="ui-button ui-button--secondary"
                          href={`/my-courses/${section.id}/${assignment.id}`}
                        >
                          Open
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {work.length === 0 ? <p className="muted">No assignments published yet.</p> : null}
            </Card>
          ))
        )}
      </div>
    </>
  );
}
