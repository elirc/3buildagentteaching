import { Card, CardHeader, Field, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { createStudent } from "@/lib/actions";

export default async function NewStudentPage() {
  const advisors = await prisma.user.findMany({ where: { role: "Advisor" }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="New Student" description="Create a student profile with guardian and advisor context." />
      <Card>
        <CardHeader title="Student details" />
        <form action={createStudent} className="stack">
          <div className="form-grid">
            <Field label="First name"><input name="firstName" required /></Field>
            <Field label="Last name"><input name="lastName" required /></Field>
            <Field label="Email"><input name="email" type="email" required /></Field>
            <Field label="Grade level"><input name="gradeLevel" type="number" min="1" max="12" defaultValue="9" required /></Field>
            <Field label="Enrollment status">
              <select name="enrollmentStatus" defaultValue="Active">
                <option value="Active">Active</option>
                <option value="Probation">Probation</option>
                <option value="Withdrawn">Withdrawn</option>
                <option value="Graduated">Graduated</option>
              </select>
            </Field>
            <Field label="Student number"><input name="studentNumber" required /></Field>
            <Field label="Guardian name"><input name="guardianName" required /></Field>
            <Field label="Guardian email"><input name="guardianEmail" type="email" required /></Field>
            <Field label="Advisor">
              <select name="advisorId" defaultValue="">
                <option value="">None</option>
                {advisors.map((advisor) => <option key={advisor.id} value={advisor.id}>{advisor.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="form-actions">
            <button className="ui-button ui-button--primary" type="submit">Create student</button>
            <a className="ui-button ui-button--secondary" href="/students">Cancel</a>
          </div>
        </form>
      </Card>
    </>
  );
}
