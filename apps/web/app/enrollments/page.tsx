import { Card, CardHeader, DataTable, Field, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { enrollStudent } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function EnrollmentsPage() {
  const [enrollments, students, sections] = await Promise.all([
    prisma.enrollment.findMany({ include: { student: true, classSection: { include: { course: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.student.findMany({ orderBy: { lastName: "asc" } }),
    prisma.classSection.findMany({ include: { course: true, academicTerm: true }, orderBy: { academicTerm: { startsAt: "desc" } } })
  ]);
  return (
    <>
      <PageHeader title="Enrollment Management" description="Enroll students, view rosters, capacity, active courses, and waitlist decisions." />
      <div className="split">
        <Card>
          <CardHeader title="Enrollment Records" />
          <DataTable>
            <thead><tr><th>Student</th><th>Section</th><th>Status</th><th>Enrolled</th><th>Dropped</th></tr></thead>
            <tbody>
              {enrollments.map((enrollment) => (
                <tr key={enrollment.id}>
                  <td><a href={`/students/${enrollment.studentId}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a></td>
                  <td><a href={`/sections/${enrollment.classSectionId}`}>{enrollment.classSection.course.title}</a></td>
                  <td><StatusBadge value={enrollment.status} /></td>
                  <td>{formatDate(enrollment.enrolledAt)}</td>
                  <td>{formatDate(enrollment.droppedAt)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
        <Card>
          <CardHeader title="Enroll Student Into Section" />
          <ActionForm action={enrollStudent} className="stack">
            <Field label="Student"><select name="studentId">{students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} · {student.enrollmentStatus}</option>)}</select></Field>
            <Field label="Section"><select name="classSectionId">{sections.map((section) => <option key={section.id} value={section.id}>{section.course.title} · {section.academicTerm.name}</option>)}</select></Field>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="allowWaitlist" /> Waitlist if section is full</label>
            <SubmitButton variant="primary">Enroll</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
