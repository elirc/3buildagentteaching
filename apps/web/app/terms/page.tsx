import { Card, CardHeader, DataTable, Field, PageHeader, Stat } from "@agentic-edu/ui";
import { getAcademicOperationsOverview } from "@agentic-edu/application";
import { validateGradingPeriodWeights } from "@agentic-edu/domain";
import { createAcademicTerm, createGradingPeriod } from "@/lib/actions";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";

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
        <ActionForm action={createAcademicTerm} className="ui-form-grid">
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
          <SubmitButton variant="primary">Create term</SubmitButton>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Create Grading Period" />
        <ActionForm action={createGradingPeriod} className="ui-form-grid">
          <Field label="Term">
            <select name="academicTermId">
              {overview.terms.map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
            </select>
          </Field>
          <Field label="Name"><input name="name" placeholder="Q3" required /></Field>
          <Field label="Starts"><input name="startsAt" type="date" required /></Field>
          <Field label="Ends"><input name="endsAt" type="date" required /></Field>
          <Field label="Weight"><input name="weight" type="number" step="0.1" defaultValue="1" required /></Field>
          <SubmitButton variant="secondary">Add period</SubmitButton>
        </ActionForm>
      </Card>

      <div className="stack">
        {overview.terms.map((term) => {
          const weightReport = validateGradingPeriodWeights(
            term.gradingPeriods.map((period) => ({ name: period.name, weight: period.weight }))
          );
          return (
            <Card key={term.id}>
              <CardHeader
                title={<a href={`/terms/${term.id}`}>{term.name}</a>}
                eyebrow={`${formatDate(term.startsAt)} to ${formatDate(term.endsAt)}`}
                actions={<StatusBadge value={term.status} />}
              >
                {term.sections.length} section(s): {term.sections.map((section) => section.course.code).join(", ") || "none yet"}
              </CardHeader>
              {/* Flagged, not refused. A term being set up legitimately has
                  weights that do not yet total 1, and the weighted average
                  divides by the actual total anyway — so this is a "did you
                  mean to leave it like that?", not an error. */}
              {weightReport.valid ? null : (
                <p className="form-error" role="alert"><strong>Check this:</strong> {weightReport.reason}</p>
              )}
              <DataTable>
                <thead><tr><th>Grading period</th><th>Dates</th><th>Weight</th><th>Assignments</th></tr></thead>
                <tbody>
                  {term.gradingPeriods.map((period) => (
                    <tr key={period.id}>
                      <td>{period.name}</td>
                      <td>{formatDate(period.startsAt)} to {formatDate(period.endsAt)}</td>
                      <td>{Math.round(period.weight * 100)}%</td>
                      {/* A period carrying weight but no assignments is a
                          configuration mistake that is invisible until grades
                          come out wrong. */}
                      <td>
                        {period._count.assignments}
                        {period._count.assignments === 0 && period.weight > 0 ? <span className="muted"> · weighted but empty</span> : null}
                      </td>
                    </tr>
                  ))}
                  {term.gradingPeriods.length === 0 ? (
                    <tr><td colSpan={4}>No grading periods. Averages in this term are a flat points-earned over points-possible.</td></tr>
                  ) : null}
                </tbody>
              </DataTable>
            </Card>
          );
        })}
      </div>
    </>
  );
}
