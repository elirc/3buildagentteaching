import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { getAcademicOperationsOverview } from "@agentic-edu/application";
import { createRubric, runGradingConsistencyAgent } from "@/lib/actions";

export default async function RubricsPage() {
  const [overview, assignments, teachers] = await Promise.all([
    getAcademicOperationsOverview(),
    prisma.assignment.findMany({ orderBy: { dueDate: "desc" } }),
    prisma.teacher.findMany({ orderBy: { lastName: "asc" } })
  ]);

  return (
    <>
      <PageHeader title="Rubrics" description="Structured grading criteria for assignment quality, feedback consistency, and future grading agents." />
      <div className="ui-stat-grid">
        <Stat label="Rubrics" value={overview.rubrics.length} />
        <Stat label="Criteria" value={overview.rubrics.reduce((sum, rubric) => sum + rubric.criteria.length, 0)} />
        <Stat label="Assignments" value={assignments.length} />
      </div>

      <Card>
        <CardHeader title="Create Rubric" />
        <form action={createRubric} className="ui-form-grid">
          <Field label="Assignment">
            <select name="assignmentId">
              <option value="">Unattached</option>
              {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.title}</option>)}
            </select>
          </Field>
          <Field label="Teacher">
            <select name="createdByTeacherId">
              {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.firstName} {teacher.lastName}</option>)}
            </select>
          </Field>
          <Field label="Title"><input name="title" required /></Field>
          <Field label="Description"><input name="description" /></Field>
          <Field label="Criteria" hint="Comma-separated criterion names; each defaults to 10 points.">
            <input name="criteria" placeholder="Accuracy, Reasoning, Completeness" required />
          </Field>
          <button className="ui-button ui-button--primary" type="submit">Create rubric</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Rubric Library" />
        <DataTable>
          <thead><tr><th>Rubric</th><th>Assignment</th><th>Criteria</th><th>Total Points</th><th>Agent</th></tr></thead>
          <tbody>
            {overview.rubrics.map((rubric) => (
              <tr key={rubric.id}>
                <td>{rubric.title}</td>
                <td>{rubric.assignment?.title ?? "Unattached"}</td>
                <td>{rubric.criteria.map((criterion) => criterion.title).join(", ")}</td>
                <td>{rubric.criteria.reduce((sum, criterion) => sum + criterion.pointsPossible, 0)}</td>
                <td>
                  {rubric.assignmentId ? (
                    <form action={runGradingConsistencyAgent}>
                      <input type="hidden" name="assignmentId" value={rubric.assignmentId} />
                      <button className="ui-button ui-button--secondary" type="submit">Run grading check</button>
                    </form>
                  ) : "Attach first"}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
