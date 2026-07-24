import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { getAcademicOperationsOverview } from "@agentic-edu/application";
import { createGuardian, linkGuardianToStudent } from "@/lib/actions";

export default async function GuardiansPage() {
  const [overview, students] = await Promise.all([
    getAcademicOperationsOverview(),
    prisma.student.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })
  ]);

  return (
    <>
      <PageHeader title="Guardians" description="Normalized guardian contacts and student relationships for digest and outreach workflows." />
      <div className="ui-stat-grid">
        <Stat label="Guardians" value={overview.guardians.length} />
        <Stat label="Student links" value={overview.metrics.guardianLinks} />
        <Stat label="Digest notifications" value={overview.notifications.filter((notification) => notification.channel === "Digest").length} />
      </div>

      <Card>
        <CardHeader title="Create Guardian" />
        <form action={createGuardian} className="ui-form-grid">
          <Field label="First name"><input name="firstName" required /></Field>
          <Field label="Last name"><input name="lastName" required /></Field>
          <Field label="Email"><input name="email" type="email" required /></Field>
          <Field label="Phone"><input name="phone" /></Field>
          <button className="ui-button ui-button--primary" type="submit">Create guardian</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Link Guardian To Student" />
        <form action={linkGuardianToStudent} className="ui-form-grid">
          <Field label="Student">
            <select name="studentId">
              {students.map((student) => <option key={student.id} value={student.id}>{student.firstName} {student.lastName}</option>)}
            </select>
          </Field>
          <Field label="Guardian">
            <select name="guardianId">
              {overview.guardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.firstName} {guardian.lastName}</option>)}
            </select>
          </Field>
          <Field label="Relationship">
            <select name="relationship" defaultValue="Guardian">
              <option value="Mother">Mother</option>
              <option value="Father">Father</option>
              <option value="Guardian">Guardian</option>
              <option value="Grandparent">Grandparent</option>
              <option value="Other">Other</option>
            </select>
          </Field>
          <label className="ui-checkbox"><input name="isPrimary" type="checkbox" /> Primary</label>
          <label className="ui-checkbox"><input name="receivesDigest" type="checkbox" defaultChecked /> Receives digest</label>
          <label className="ui-checkbox"><input name="emergencyContact" type="checkbox" /> Emergency contact</label>
          <button className="ui-button ui-button--secondary" type="submit">Link guardian</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Guardian Directory" />
        <DataTable>
          <thead><tr><th>Guardian</th><th>Email</th><th>Phone</th><th>Students</th></tr></thead>
          <tbody>
            {overview.guardians.map((guardian) => (
              <tr key={guardian.id}>
                <td>{guardian.firstName} {guardian.lastName}</td>
                <td>{guardian.email}</td>
                <td>{guardian.phone ?? "None"}</td>
                <td>{guardian.students.map((link) => `${link.student.firstName} ${link.student.lastName}`).join(", ") || "None"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
