import { Card, CardHeader, Field, PageHeader } from "@agentic-edu/ui";
import { createCourse } from "@/lib/actions";

export default function NewCoursePage() {
  return (
    <>
      <PageHeader title="New Course" description="Create a reusable course catalog entry. Sections are scheduled separately." />
      <Card>
        <CardHeader title="Course details" />
        <form action={createCourse} className="stack">
          <div className="form-grid">
            <Field label="Code"><input name="code" required /></Field>
            <Field label="Title"><input name="title" required /></Field>
            <Field label="Subject"><input name="subject" required /></Field>
            <Field label="Grade level"><input name="gradeLevel" type="number" min="1" max="12" defaultValue="9" required /></Field>
            <Field label="Credit hours"><input name="creditHours" type="number" step="0.25" min="0.25" defaultValue="1" required /></Field>
            <Field label="Status">
              <select name="status" defaultValue="Draft">
                <option value="Draft">Draft</option>
                <option value="Active">Active</option>
                <option value="Archived">Archived</option>
              </select>
            </Field>
            <Field label="Description"><textarea name="description" required /></Field>
          </div>
          <div className="form-actions">
            <button className="ui-button ui-button--primary" type="submit">Create course</button>
            <a className="ui-button ui-button--secondary" href="/courses">Cancel</a>
          </div>
        </form>
      </Card>
    </>
  );
}
