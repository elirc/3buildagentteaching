import { Card, CardHeader, Field, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { createSection } from "@/lib/actions";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function NewSectionPage() {
  const [courses, teachers, terms] = await Promise.all([
    prisma.course.findMany({ where: { status: "Active" }, orderBy: { code: "asc" } }),
    prisma.teacher.findMany({ where: { employmentStatus: "Active" }, orderBy: { lastName: "asc" } }),
    prisma.academicTerm.findMany({ orderBy: { startsAt: "desc" } })
  ]);
  return (
    <>
      <PageHeader title="New Class Section" description="Create a scheduled section. Domain rules require an active teacher." />
      <Card>
        <CardHeader title="Section details" />
        <ActionForm action={createSection} className="stack">
          <div className="form-grid">
            <Field label="Course">
              <select name="courseId" required>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} - {course.title}</option>)}</select>
            </Field>
            <Field label="Teacher">
              <select name="teacherId" required>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</select>
            </Field>
            <Field label="Academic term">
              <select name="academicTermId">
                <option value="">None</option>
                {terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
              </select>
            </Field>
            <Field label="Term"><input name="term" defaultValue="Fall 2026" required /></Field>
            <Field label="Room"><input name="room" required /></Field>
            <Field label="Days"><input name="days" defaultValue="Mon, Wed, Fri" required /></Field>
            <Field label="Start time"><input name="start" defaultValue="09:00" required /></Field>
            <Field label="End time"><input name="end" defaultValue="09:55" required /></Field>
            <Field label="Capacity"><input name="capacity" type="number" min="1" defaultValue="28" required /></Field>
            <Field label="Status">
              <select name="status" defaultValue="Planned">
                <option value="Planned">Planned</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <SubmitButton variant="primary">Create section</SubmitButton>
            <a className="ui-button ui-button--secondary" href="/sections">Cancel</a>
          </div>
        </ActionForm>
      </Card>
    </>
  );
}
