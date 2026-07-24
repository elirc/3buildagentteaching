import { Card, CardHeader, Field, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { createAssignment } from "@/lib/actions";

export default async function NewAssignmentPage() {
  const [sections, teachers, gradingPeriods] = await Promise.all([
    prisma.classSection.findMany({ include: { course: true }, orderBy: { term: "desc" } }),
    prisma.teacher.findMany({ where: { employmentStatus: "Active" }, orderBy: { lastName: "asc" } }),
    prisma.gradingPeriod.findMany({ include: { academicTerm: true }, orderBy: { startsAt: "desc" } })
  ]);
  return (
    <>
      <PageHeader title="New Assignment" description="Create and optionally publish an assignment for a class section." />
      <Card>
        <CardHeader title="Assignment details" />
        <form action={createAssignment} className="stack">
          <div className="form-grid">
            <Field label="Section"><select name="classSectionId">{sections.map((section) => <option key={section.id} value={section.id}>{section.course.title} · {section.term}</option>)}</select></Field>
            <Field label="Grading period">
              <select name="gradingPeriodId">
                <option value="">None</option>
                {gradingPeriods.map((period) => <option key={period.id} value={period.id}>{period.academicTerm.name} - {period.name}</option>)}
              </select>
            </Field>
            <Field label="Created by"><select name="createdByTeacherId">{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}</select></Field>
            <Field label="Title"><input name="title" required /></Field>
            <Field label="Type"><select name="type" defaultValue="Homework"><option value="Homework">Homework</option><option value="Quiz">Quiz</option><option value="Exam">Exam</option><option value="Project">Project</option><option value="Discussion">Discussion</option><option value="Lab">Lab</option><option value="Other">Other</option></select></Field>
            <Field label="Status"><select name="status" defaultValue="Draft"><option value="Draft">Draft</option><option value="Published">Published</option><option value="Closed">Closed</option></select></Field>
            <Field label="Due date"><input name="dueDate" type="date" required /></Field>
            <Field label="Points possible"><input name="pointsPossible" type="number" min="1" step="0.5" defaultValue="20" required /></Field>
            <Field label="Description"><textarea name="description" required /></Field>
          </div>
          <div className="form-actions">
            <button className="ui-button ui-button--primary" type="submit">Create assignment</button>
            <a className="ui-button ui-button--secondary" href="/assignments">Cancel</a>
          </div>
        </form>
      </Card>
    </>
  );
}
