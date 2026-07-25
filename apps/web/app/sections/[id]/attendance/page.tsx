import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, EmptyState, PageHeader, Stat } from "@agentic-edu/ui";
import { getSectionAttendanceSheet, parseSheetDate, toDateParam } from "@agentic-edu/application";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { getActorCapabilities } from "@/lib/capabilities";
import { percent } from "@/lib/format";
import { recordSectionAttendance } from "@/lib/actions";

const STATUSES = ["Present", "Absent", "Tardy", "Excused"] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export default async function SectionAttendancePage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const { can } = await getActorCapabilities();

  const date = parseSheetDate(query.date);
  const sheet = await getSectionAttendanceSheet(id, date);
  if (!sheet) notFound();

  const { section, rows, totals } = sheet;
  const canRecord = can("attendance:record", { teacherId: section.teacherId });

  const previousDay = toDateParam(new Date(date.getTime() - DAY_MS));
  const nextDay = toDateParam(new Date(date.getTime() + DAY_MS));

  // The term guard is advisory here and enforced in the service. Showing it up
  // front means the teacher finds out before filling in 28 radio buttons.
  const outsideTerm =
    section.academicTerm && (date < section.academicTerm.startsAt || date > section.academicTerm.endsAt);

  return (
    <>
      <PageHeader
        title={`Attendance · ${section.course.title}`}
        description={`${section.term} · Room ${section.room} · ${section.teacher.firstName} ${section.teacher.lastName}`}
        actions={<a className="ui-button ui-button--secondary" href={`/sections/${section.id}`}>Back to section</a>}
      />

      <Card>
        <CardHeader title="Date" />
        <div className="ui-actions" style={{ justifyContent: "flex-start" }}>
          <a className="ui-button ui-button--ghost" href={`/sections/${section.id}/attendance?date=${previousDay}`}>
            ‹ Previous day
          </a>
          <form method="get" style={{ display: "inline-flex", gap: "var(--space-2)" }}>
            <input name="date" type="date" defaultValue={toDateParam(date)} />
            <button className="ui-button ui-button--secondary" type="submit">Go</button>
          </form>
          <a className="ui-button ui-button--ghost" href={`/sections/${section.id}/attendance?date=${nextDay}`}>
            Next day ›
          </a>
        </div>
        {outsideTerm ? (
          <p className="form-error" role="alert">
            <strong>Outside term:</strong> {toDateParam(date)} falls outside {section.academicTerm?.name}. Saving will
            be refused.
          </p>
        ) : null}
      </Card>

      <div className="metric-row">
        <Stat label="Present" value={totals.present} tone="good" />
        <Stat label="Absent" value={totals.absent} tone={totals.absent > 0 ? "danger" : "neutral"} />
        <Stat label="Tardy" value={totals.tardy} tone={totals.tardy > 0 ? "warn" : "neutral"} />
        <Stat label="Recorded" value={`${totals.recorded} of ${totals.roster}`} tone={totals.recorded === totals.roster ? "good" : "warn"} />
      </div>

      <Card>
        <CardHeader title="Register">
          One submission for the whole class. Re-submitting the same date corrects it rather than duplicating.
        </CardHeader>

        {rows.length === 0 ? (
          <EmptyState title="No students enrolled">Enrol students in this section before taking attendance.</EmptyState>
        ) : (
          <ActionForm action={recordSectionAttendance} className="stack" errorPlacement="bottom">
            <input type="hidden" name="classSectionId" value={section.id} />
            <input type="hidden" name="date" value={toDateParam(date)} />
            <input type="hidden" name="recordedByTeacherId" value={section.teacherId} />

            <DataTable>
              <thead>
                <tr>
                  <th>Student</th>
                  {STATUSES.map((status) => <th key={status}>{status}</th>)}
                  <th>Notes</th>
                  <th>Running</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ student, existing, summary }) => (
                  <tr key={student.id}>
                    <td>
                      <a href={`/students/${student.id}`}>{student.firstName} {student.lastName}</a>
                    </td>
                    {STATUSES.map((status) => (
                      <td key={status}>
                        <input
                          type="radio"
                          name={`status_${student.id}`}
                          value={status}
                          /* Defaults to Present only for a student with no
                             record yet. An existing record pre-selects itself,
                             which is what makes this an edit view too. */
                          defaultChecked={existing ? existing.status === status : status === "Present"}
                          disabled={!canRecord}
                          aria-label={`${student.firstName} ${student.lastName} ${status}`}
                        />
                      </td>
                    ))}
                    <td>
                      <input name={`notes_${student.id}`} defaultValue={existing?.notes ?? ""} disabled={!canRecord} />
                    </td>
                    <td>
                      <StatusBadge value={summary.concernLevel} /> {percent(summary.attendanceRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>

            <SubmitButton variant="primary" disabled={!canRecord}>
              Save register for {toDateParam(date)}
            </SubmitButton>
            {!canRecord ? (
              <p className="muted">Recording attendance is limited to this section&apos;s teacher and administrators.</p>
            ) : null}
          </ActionForm>
        )}
      </Card>
    </>
  );
}
