import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, Field, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { dropEnrollment, enrollStudent } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function SectionRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [section, students] = await Promise.all([
    prisma.classSection.findUnique({ where: { id }, include: { course: true, enrollments: { include: { student: true } } } }),
    prisma.student.findMany({ orderBy: [{ gradeLevel: "asc" }, { lastName: "asc" }] })
  ]);
  if (!section) notFound();

  return (
    <>
      <PageHeader title={`Roster · ${section.course.title}`} description="Enroll, waitlist, and drop students with domain rules enforcing capacity and eligibility." />
      <div className="split">
        <Card>
          <CardHeader title="Current Roster" />
          <DataTable>
            <thead><tr><th>Student</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {section.enrollments.map((enrollment) => (
                <tr key={enrollment.id}>
                  <td><a href={`/students/${enrollment.student.id}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a></td>
                  <td><StatusBadge value={enrollment.status} /></td>
                  <td>
                    {enrollment.status !== "Dropped" ? (
                      <ActionForm action={dropEnrollment}>
                        <input type="hidden" name="id" value={enrollment.id} />
                        <SubmitButton variant="danger">Drop</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>

        <Card>
          <CardHeader title="Enroll Student" />
          <ActionForm action={enrollStudent} className="stack">
            <input type="hidden" name="classSectionId" value={section.id} />
            <Field label="Student">
              <select name="studentId">
                {students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName} · {student.enrollmentStatus}</option>)}
              </select>
            </Field>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" name="allowWaitlist" /> Waitlist if full
            </label>
            <SubmitButton variant="primary">Enroll student</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
