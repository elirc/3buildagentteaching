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
        {gradebooks.map(({ section, rows, periods, weightReport, classAverage }) => {
          const weighted = periods.length > 0;
          return (
            <Card key={section.id}>
              <CardHeader title={`${section.course.title} · ${section.academicTerm.name}`} eyebrow={`${section.teacher.firstName} ${section.teacher.lastName}`}>
                Class average {percent(classAverage)} across {rows.length} active student(s).
              </CardHeader>
              {weighted ? (
                <p className="muted">
                  Weighted by grading period: {periods.map((period) => `${period.name} ${Math.round(period.weight * 100)}%`).join(" · ")}
                </p>
              ) : null}
              {/* Shown, not enforced. A term part-way through setup legitimately
                  has weights that do not yet total 1, and refusing to render a
                  gradebook over it would be useless at exactly the moment
                  someone is fixing it. */}
              {weightReport.valid ? null : <p className="form-error" role="alert"><strong>Check this:</strong> {weightReport.reason}</p>}
              <DataTable>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>{weighted ? "Weighted" : "Average"}</th>
                    {weighted ? <th>Unweighted</th> : null}
                    {periods.map((period) => <th key={period.id}>{period.name}</th>)}
                    <th>Band</th><th>Missing</th><th>Late</th><th>Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ enrollment, summary }) => (
                    <tr key={enrollment.id}>
                      <td><a href={`/students/${enrollment.studentId}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a></td>
                      <td>{percent(weighted ? summary.weightedAverage : summary.average)}</td>
                      {/* Both numbers, on purpose. The first question anyone asks
                          of a weighted grade is "what would it have been
                          otherwise", and a gradebook that cannot answer it
                          invites a spreadsheet. */}
                      {weighted ? <td className="muted">{percent(summary.average)}</td> : null}
                      {periods.map((period) => {
                        const breakdown = summary.periods.find((entry) => entry.gradingPeriodId === period.id);
                        return <td key={period.id}>{percent(breakdown?.average ?? null)}</td>;
                      })}
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
