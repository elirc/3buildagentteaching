import { Card, CardHeader, DataTable, Field, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { summarizeAttendance } from "@agentic-edu/domain";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, percent } from "@/lib/format";
import { recordAttendance, runAttendanceAnomalyAgent } from "@/lib/actions";

export default async function AttendancePage() {
  const [records, students, sections, teachers, latestRuns] = await Promise.all([
    prisma.attendanceRecord.findMany({ include: { student: true, classSection: { include: { course: true } } }, orderBy: { date: "desc" }, take: 80 }),
    prisma.student.findMany({ orderBy: { lastName: "asc" } }),
    prisma.classSection.findMany({ include: { course: true }, orderBy: { term: "desc" } }),
    prisma.teacher.findMany({ orderBy: { lastName: "asc" } }),
    prisma.agentRun.findMany({ where: { agentType: "AttendanceAnomaly" }, orderBy: { createdAt: "desc" }, take: 5 })
  ]);
  const summaries = students.map((student) => ({
    student,
    summary: summarizeAttendance(records.filter((record) => record.studentId === student.id).map((record) => ({ status: record.status, date: record.date })))
  }));

  return (
    <>
      <PageHeader title="Attendance" description="Daily attendance entry, student summaries, and anomaly detection." />
      <div className="split">
        <div className="stack">
          <Card>
            <CardHeader title="Student Attendance Summary" />
            <DataTable>
              <thead><tr><th>Student</th><th>Attendance rate</th><th>Absent</th><th>Tardy</th><th>Concern</th><th>Agent</th></tr></thead>
              <tbody>
                {summaries.map(({ student, summary }) => (
                  <tr key={student.id}>
                    <td><a href={`/students/${student.id}`}>{student.firstName} {student.lastName}</a></td>
                    <td>{percent(summary.attendanceRate)}</td>
                    <td>{summary.absent}</td>
                    <td>{summary.tardy}</td>
                    <td><StatusBadge value={summary.concernLevel} /></td>
                    <td>
                      <form action={runAttendanceAnomalyAgent}>
                        <input type="hidden" name="targetType" value="Student" />
                        <input type="hidden" name="targetId" value={student.id} />
                        <button className="ui-button ui-button--secondary" type="submit">Run</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
          <Card>
            <CardHeader title="Recent Attendance Records" />
            <DataTable>
              <thead><tr><th>Date</th><th>Student</th><th>Section</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>
                {records.map((record) => (
                  <tr key={record.id}><td>{formatDate(record.date)}</td><td>{record.student.firstName} {record.student.lastName}</td><td>{record.classSection.course.title}</td><td><StatusBadge value={record.status} /></td><td>{record.notes ?? ""}</td></tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>
        <div className="stack">
          <Card>
            <CardHeader title="Daily Attendance Entry" />
            <form action={recordAttendance} className="stack">
              <Field label="Student"><select name="studentId">{students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}</select></Field>
              <Field label="Section"><select name="classSectionId">{sections.map((section) => <option key={section.id} value={section.id}>{section.course.title}</option>)}</select></Field>
              <Field label="Recorded by"><select name="recordedByTeacherId">{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</select></Field>
              <Field label="Date"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
              <Field label="Status"><select name="status"><option value="Present">Present</option><option value="Absent">Absent</option><option value="Tardy">Tardy</option><option value="Excused">Excused</option></select></Field>
              <Field label="Notes"><textarea name="notes" /></Field>
              <button className="ui-button ui-button--primary" type="submit">Save attendance</button>
            </form>
          </Card>
          <Card>
            <CardHeader title="Latest Attendance Agent Runs" />
            <ul className="list">
              {latestRuns.map((run) => <li key={run.id}><a href={`/agent-runs/${run.id}`}>{run.targetType} {run.targetId}</a> · confidence {run.confidenceScore ?? "n/a"}</li>)}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
