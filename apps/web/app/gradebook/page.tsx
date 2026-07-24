import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { getSectionGradebook } from "@agentic-edu/application";
import { StatusBadge } from "@/components/status-badge";
import { percent } from "@/lib/format";

export default async function GradebookPage() {
  const gradebooks = await getSectionGradebook();

  return (
    <>
      <PageHeader title="Gradebook" description="Section-level grade summaries calculated by domain logic, not React components." />
      <div className="stack">
        {gradebooks.map(({ section, rows, classAverage }) => {
          return (
            <Card key={section.id}>
              <CardHeader title={`${section.course.title} · ${section.term}`} eyebrow={`${section.teacher.firstName} ${section.teacher.lastName}`}>
                Class average {percent(classAverage)} across {rows.length} active student(s).
              </CardHeader>
              <DataTable>
                <thead><tr><th>Student</th><th>Average</th><th>Band</th><th>Missing</th><th>Late</th><th>Trend</th></tr></thead>
                <tbody>
                  {rows.map(({ enrollment, summary }) => (
                    <tr key={enrollment.id}>
                      <td><a href={`/students/${enrollment.studentId}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a></td>
                      <td>{percent(summary.average)}</td>
                      <td><StatusBadge value={summary.performanceBand} /></td>
                      <td>{summary.missingCount}</td>
                      <td>{summary.lateCount}</td>
                      <td>{summary.trend}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Card>
          );
        })}
      </div>
    </>
  );
}
