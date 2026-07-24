import { Card, CardHeader, DataTable, LinkButton, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { calculateGradeSummary, scoreStudentRisk, summarizeAttendance } from "@agentic-edu/domain";
import { StatusBadge } from "@/components/status-badge";
import { percent } from "@/lib/format";

export default async function StudentsPage({ searchParams }: { searchParams?: Promise<{ status?: string; grade?: string }> }) {
  const params = (await searchParams) ?? {};
  const students = await prisma.student.findMany({
    where: {
      enrollmentStatus: params.status ? (params.status as never) : undefined,
      gradeLevel: params.grade ? Number(params.grade) : undefined
    },
    include: {
      submissions: { include: { assignment: true } },
      attendanceRecords: true,
      interventionPlans: true,
      supportNotes: true
    },
    orderBy: [{ gradeLevel: "asc" }, { lastName: "asc" }]
  });

  return (
    <>
      <PageHeader title="Students" description="Student records, academic signals, attendance summaries, interventions, and audit context." actions={<LinkButton href="/students/new" variant="primary">New student</LinkButton>} />
      <Card>
        <CardHeader title="Filters" />
        <form className="form-grid">
          <label className="ui-field">
            <span>Status</span>
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Any</option>
              <option value="Active">Active</option>
              <option value="Probation">Probation</option>
              <option value="Withdrawn">Withdrawn</option>
              <option value="Graduated">Graduated</option>
            </select>
          </label>
          <label className="ui-field">
            <span>Grade level</span>
            <input name="grade" type="number" min="1" max="12" defaultValue={params.grade ?? ""} />
          </label>
          <div className="form-actions">
            <button className="ui-button ui-button--secondary" type="submit">Apply filters</button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Student Directory" />
        <DataTable>
          <thead>
            <tr><th>Name</th><th>Grade</th><th>Status</th><th>Average</th><th>Attendance</th><th>Risk</th></tr>
          </thead>
          <tbody>
            {students.map((student) => {
              const gradeSummary = calculateGradeSummary(student.submissions.map((submission) => ({ score: submission.score, pointsPossible: submission.assignment.pointsPossible, status: submission.status, gradedAt: submission.gradedAt })));
              const attendanceSummary = summarizeAttendance(student.attendanceRecords.map((record) => ({ status: record.status, date: record.date })));
              const risk = scoreStudentRisk({
                gradeSummary,
                attendanceSummary,
                activeInterventionCount: student.interventionPlans.filter((plan) => plan.status === "Active").length,
                recentSupportNoteCount: student.supportNotes.length
              });
              return (
                <tr key={student.id}>
                  <td><a href={`/students/${student.id}`}>{student.firstName} {student.lastName}</a></td>
                  <td>{student.gradeLevel}</td>
                  <td><StatusBadge value={student.enrollmentStatus} /></td>
                  <td>{percent(gradeSummary.average)}</td>
                  <td>{attendanceSummary.absent} absences · {attendanceSummary.tardy} tardies</td>
                  <td><StatusBadge value={risk.level} /></td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
