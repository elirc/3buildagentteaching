import { Card, CardHeader, Field, PageHeader } from "@agentic-edu/ui";
import { createTeacher } from "@/lib/actions";

export default function NewTeacherPage() {
  return (
    <>
      <PageHeader title="New Teacher" description="Create a teacher profile. Inactive teachers cannot be assigned to new sections." />
      <Card>
        <CardHeader title="Teacher details" />
        <form action={createTeacher} className="stack">
          <div className="form-grid">
            <Field label="First name"><input name="firstName" required /></Field>
            <Field label="Last name"><input name="lastName" required /></Field>
            <Field label="Email"><input name="email" type="email" required /></Field>
            <Field label="Department"><input name="department" required /></Field>
            <Field label="Employment status">
              <select name="employmentStatus" defaultValue="Active">
                <option value="Active">Active</option>
                <option value="OnLeave">On leave</option>
                <option value="Inactive">Inactive</option>
              </select>
            </Field>
            <Field label="Subjects taught" hint="Comma-separated"><input name="subjectsTaught" placeholder="Algebra, Geometry" /></Field>
            <Field label="Office location"><input name="officeLocation" /></Field>
          </div>
          <div className="form-actions">
            <button className="ui-button ui-button--primary" type="submit">Create teacher</button>
            <a className="ui-button ui-button--secondary" href="/teachers">Cancel</a>
          </div>
        </form>
      </Card>
    </>
  );
}
