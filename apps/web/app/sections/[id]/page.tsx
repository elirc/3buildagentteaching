import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { calculateClassAverage, calculateGradeSummary } from "@agentic-edu/domain";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, percent } from "@/lib/format";
import { recordAttendance, runAttendanceAnomalyAgent, updateSection } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { guardStaffRecord } from "@/components/route-guard";

export default async function SectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardStaffRecord();
  if (denied) return denied;

  const { id } = await params;
  const section = await prisma.classSection.findUnique({
    where: { id },
    include: {
      course: true,
      teacher: true,
      academicTerm: true,
      enrollments: { include: { student: { include: { submissions: { include: { assignment: true } } } } } },
      assignments: { include: { submissions: { include: { student: true } } }, orderBy: { dueDate: "asc" } },
      attendanceRecords: { include: { student: true }, orderBy: { date: "desc" } }
    }
  });
  if (!section) notFound();
  const [courses, teachers, terms, anomalyRun] = await Promise.all([
    prisma.course.findMany({ orderBy: { code: "asc" } }),
    prisma.teacher.findMany({ orderBy: { lastName: "asc" } }),
    prisma.academicTerm.findMany({ orderBy: { startsAt: "desc" } }),
    prisma.agentRun.findFirst({ where: { agentType: "AttendanceAnomaly", targetType: "ClassSection", targetId: id }, orderBy: { createdAt: "desc" } })
  ]);

  const enrolled = section.enrollments.filter((enrollment) => enrollment.status === "Enrolled");
  const gradeSummaries = enrolled.map((enrollment) =>
    calculateGradeSummary(enrollment.student.submissions.filter((submission) => submission.assignment.classSectionId === section.id).map((submission) => ({
      score: submission.score,
      pointsPossible: submission.assignment.pointsPossible,
      status: submission.status,
      gradedAt: submission.gradedAt
    })))
  );
  const classAverage = calculateClassAverage(gradeSummaries);
  const schedule = section.schedule as { days?: string[]; start?: string; end?: string };

  return (
    <>
      <PageHeader title={`${section.course.title} · ${section.term}`} description={`${section.course.code} in room ${section.room} with ${section.teacher.firstName} ${section.teacher.lastName}`} actions={<StatusBadge value={section.status} />} />
      <div className="metric-row">
        <Stat label="Roster" value={`${enrolled.length}/${section.capacity}`} tone={enrolled.length >= section.capacity ? "warn" : "info"} />
        <Stat label="Assignments" value={section.assignments.length} tone="info" />
        <Stat label="Class average" value={percent(classAverage)} tone="info" />
        <Stat label="Attendance records" value={section.attendanceRecords.length} tone="info" />
      </div>

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Roster" actions={<><a className="ui-button ui-button--secondary" href={`/sections/${section.id}/roster`}>Manage roster</a> <a className="ui-button ui-button--primary" href={`/sections/${section.id}/attendance`}>Take attendance</a></>} />
            <DataTable>
              <thead><tr><th>Student</th><th>Status</th><th>Average</th></tr></thead>
              <tbody>
                {section.enrollments.map((enrollment, index) => (
                  <tr key={enrollment.id}>
                    <td><a href={`/students/${enrollment.student.id}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a></td>
                    <td><StatusBadge value={enrollment.status} /></td>
                    <td>{percent(gradeSummaries[index]?.average)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Assignments" actions={<a className="ui-button ui-button--secondary" href="/assignments/new">New assignment</a>} />
            <DataTable>
              <thead><tr><th>Title</th><th>Type</th><th>Status</th><th>Due</th><th>Submissions</th></tr></thead>
              <tbody>
                {section.assignments.map((assignment) => (
                  <tr key={assignment.id}>
                    <td><a href={`/assignments/${assignment.id}`}>{assignment.title}</a></td>
                    <td>{assignment.type}</td>
                    <td><StatusBadge value={assignment.status} /></td>
                    <td>{formatDate(assignment.dueDate)}</td>
                    <td>{assignment.submissions.length}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Attendance Records" actions={<ActionForm action={runAttendanceAnomalyAgent}><input type="hidden" name="targetType" value="ClassSection" /><input type="hidden" name="targetId" value={section.id} /><SubmitButton variant="primary">Run anomaly agent</SubmitButton></ActionForm>} />
            {anomalyRun ? <p className="muted">Latest anomaly run: <a href={`/agent-runs/${anomalyRun.id}`}>{anomalyRun.agentType}</a></p> : null}
            <DataTable>
              <thead><tr><th>Date</th><th>Student</th><th>Status</th><th>Notes</th></tr></thead>
              <tbody>
                {section.attendanceRecords.map((record) => (
                  <tr key={record.id}><td>{formatDate(record.date)}</td><td>{record.student.firstName} {record.student.lastName}</td><td><StatusBadge value={record.status} /></td><td>{record.notes ?? ""}</td></tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Edit Section" />
            <ActionForm action={updateSection} className="stack">
              <input type="hidden" name="id" value={section.id} />
              <Field label="Course"><select name="courseId" defaultValue={section.courseId}>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} - {course.title}</option>)}</select></Field>
              <Field label="Teacher"><select name="teacherId" defaultValue={section.teacherId}>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</select></Field>
              <Field label="Academic term">
                <select name="academicTermId" defaultValue={section.academicTermId ?? ""}>
                  <option value="">None</option>
                  {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
                </select>
              </Field>
              <Field label="Term"><input name="term" defaultValue={section.term} required /></Field>
              <Field label="Room"><input name="room" defaultValue={section.room} required /></Field>
              <Field label="Days"><input name="days" defaultValue={(schedule.days ?? []).join(", ")} required /></Field>
              <Field label="Start"><input name="start" defaultValue={schedule.start ?? ""} required /></Field>
              <Field label="End"><input name="end" defaultValue={schedule.end ?? ""} required /></Field>
              <Field label="Capacity"><input name="capacity" type="number" defaultValue={section.capacity} required /></Field>
              <Field label="Status"><select name="status" defaultValue={section.status}><option value="Planned">Planned</option><option value="Active">Active</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></select></Field>
              <SubmitButton variant="primary">Save section</SubmitButton>
            </ActionForm>
          </Card>

          <Card>
            <CardHeader title="Daily Attendance Entry" />
            <ActionForm action={recordAttendance} className="stack">
              <input type="hidden" name="classSectionId" value={section.id} />
              <input type="hidden" name="academicTermId" value={section.academicTermId ?? ""} />
              <input type="hidden" name="recordedByTeacherId" value={section.teacherId} />
              <Field label="Student"><select name="studentId">{enrolled.map((enrollment) => <option key={enrollment.studentId} value={enrollment.studentId}>{enrollment.student.firstName} {enrollment.student.lastName}</option>)}</select></Field>
              <Field label="Date"><input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></Field>
              <Field label="Status"><select name="status" defaultValue="Present"><option value="Present">Present</option><option value="Absent">Absent</option><option value="Tardy">Tardy</option><option value="Excused">Excused</option></select></Field>
              <Field label="Notes"><textarea name="notes" /></Field>
              <SubmitButton variant="primary">Record attendance</SubmitButton>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
