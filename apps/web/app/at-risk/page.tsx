import { Card, CardHeader, DataTable, PageHeader } from "@agentic-edu/ui";
import { getAtRiskStudentQueue } from "@agentic-edu/application";
import { StatusBadge } from "@/components/status-badge";
import { percent } from "@/lib/format";
import { runAtRiskAgent } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function AtRiskPage() {
  const rows = await getAtRiskStudentQueue();

  return (
    <>
      <PageHeader title="At-Risk Students" description="Advisor dashboard for academic, attendance, and engagement risk signals." />
      <Card>
        <CardHeader title="Risk Queue" />
        <DataTable>
          <thead><tr><th>Student</th><th>Risk</th><th>Score</th><th>Average</th><th>Absences</th><th>Evidence</th><th>Agent</th></tr></thead>
          <tbody>
            {rows.map(({ student, gradeSummary, attendanceSummary, risk }) => (
              <tr key={student.id}>
                <td><a href={`/students/${student.id}`}>{student.firstName} {student.lastName}</a></td>
                <td><StatusBadge value={risk.level} /></td>
                <td>{risk.score}</td>
                <td>{percent(gradeSummary.average)}</td>
                <td>{attendanceSummary.absent}</td>
                <td>{risk.evidence.slice(0, 2).join(" ")}</td>
                <td><ActionForm action={runAtRiskAgent}><input type="hidden" name="studentId" value={student.id} /><SubmitButton variant="secondary">Run</SubmitButton></ActionForm></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
