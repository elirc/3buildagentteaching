import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { updateCourse } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function CourseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = await prisma.course.findUnique({ where: { id }, include: { sections: { include: { teacher: true, enrollments: true } } } });
  if (!course) notFound();

  return (
    <>
      <PageHeader title={`${course.code}: ${course.title}`} description={course.description} actions={<StatusBadge value={course.status} />} />
      <div className="metric-row">
        <Stat label="Grade level" value={course.gradeLevel} tone="info" />
        <Stat label="Credit hours" value={course.creditHours} tone="info" />
        <Stat label="Sections" value={course.sections.length} tone="info" />
      </div>
      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <Card>
          <CardHeader title="Related Class Sections" />
          <DataTable>
            <thead><tr><th>Term</th><th>Teacher</th><th>Status</th><th>Roster</th></tr></thead>
            <tbody>
              {course.sections.map((section) => (
                <tr key={section.id}>
                  <td><a href={`/sections/${section.id}`}>{section.term}</a></td>
                  <td>{section.teacher.firstName} {section.teacher.lastName}</td>
                  <td><StatusBadge value={section.status} /></td>
                  <td>{section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").length}/{section.capacity}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </Card>
        <Card>
          <CardHeader title="Edit Course" />
          <ActionForm action={updateCourse} className="stack">
            <input type="hidden" name="id" value={course.id} />
            <Field label="Code"><input name="code" defaultValue={course.code} required /></Field>
            <Field label="Title"><input name="title" defaultValue={course.title} required /></Field>
            <Field label="Subject"><input name="subject" defaultValue={course.subject} required /></Field>
            <Field label="Grade level"><input name="gradeLevel" type="number" defaultValue={course.gradeLevel} required /></Field>
            <Field label="Credit hours"><input name="creditHours" type="number" step="0.25" defaultValue={course.creditHours} required /></Field>
            <Field label="Status">
              <select name="status" defaultValue={course.status}>
                <option value="Draft">Draft</option>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </Field>
            <Field label="Description"><textarea name="description" defaultValue={course.description} required /></Field>
            <SubmitButton variant="primary">Save course</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
