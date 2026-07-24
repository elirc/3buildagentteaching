import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { getAcademicOperationsOverview } from "@agentic-edu/application";
import { createAcademicTerm, createGradingPeriod } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";

export default async function TermsPage() {
  const overview = await getAcademicOperationsOverview();

  return (
    <>
      <PageHeader title="Academic Terms" description="Phase 2 calendar structure for sections, grading periods, assignments, and attendance." />
      <div className="ui-stat-grid">
        <Stat label="Active terms" value={overview.metrics.activeTerms} tone="good" />
        <Stat label="Grading periods" value={overview.terms.reduce((sum, term) => sum + term.gradingPeriods.length, 0)} />
        <Stat label="Sections attached" value={overview.terms.reduce((sum, term) => sum + term.sections.length, 0)} />
      </div>

      <Card>
        <CardHeader title="Create Term" />
        <form action={createAcademicTerm} className="ui-form-grid">
          <Field label="Name"><input name="name" placeholder="Winter 2027" required /></Field>
          <Field label="Status">
            <select name="status" defaultValue="Planned">
              <option value="Planned">Planned</option>
              <option value="Active">Active</option>
              <option value="Closed">Closed</option>
              <option value="Archived">Archived</option>
            </select>
          </Field>
          <Field label="Starts"><input name="startsAt" type="date" required /></Field>
          <Field label="Ends"><input name="endsAt" type="date" required /></Field>
          <button className="ui-button ui-button--primary" type="submit">Create term</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Create Grading Period" />
        <form action={createGradingPeriod} className="ui-form-grid">
          <Field label="Term">
            <select name="academicTermId">
              {overview.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </Field>
          <Field label="Name"><input name="name" placeholder="Q3" required /></Field>
          <Field label="Starts"><input name="startsAt" type="date" required /></Field>
          <Field label="Ends"><input name="endsAt" type="date" required /></Field>
          <Field label="Weight"><input name="weight" type="number" step="0.1" defaultValue="1" required /></Field>
          <button className="ui-button ui-button--secondary" type="submit">Add period</button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Terms" />
        <DataTable>
          <thead><tr><th>Term</th><th>Status</th><th>Dates</th><th>Periods</th><th>Sections</th></tr></thead>
          <tbody>
            {overview.terms.map((term) => (
              <tr key={term.id}>
                <td>{term.name}</td>
                <td><StatusBadge value={term.status} /></td>
                <td>{formatDate(term.startsAt)} to {formatDate(term.endsAt)}</td>
                <td>{term.gradingPeriods.map((period) => period.name).join(", ") || "None"}</td>
                <td>{term.sections.map((section) => section.course.code).join(", ") || "None"}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
