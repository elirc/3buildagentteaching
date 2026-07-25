import { Card, CardHeader, DataTable, EmptyState, PageHeader, Stat } from "@agentic-edu/ui";
import { getGuardianDashboard } from "@agentic-edu/application";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StatusBadge } from "@/components/status-badge";
import { getActorCapabilities } from "@/lib/capabilities";
import { formatDate, percent } from "@/lib/format";
import { updateGuardianPreferences } from "@/lib/actions";

/**
 * A guardian's view of their own children.
 *
 * Every list on this page comes from getGuardianDashboard, which filters by the
 * actor's guardian links at the query level. The template does no filtering of
 * its own, on purpose: if the scoping lived here, a future refactor of the JSX
 * could leak another family's data.
 */
export default async function FamilyPage({ searchParams }: { searchParams?: Promise<{ studentId?: string }> }) {
  const query = (await searchParams) ?? {};
  const { actor, can } = await getActorCapabilities();

  if (!can("guardian:viewOwnStudents")) {
    return (
      <>
        <PageHeader title="Family" description="Your children's progress." />
        <EmptyState title="You do not have access to this view">
          This page is for parents and guardians. Switch accounts using the user switcher in the top bar.
        </EmptyState>
      </>
    );
  }

  const { students, selected } = await getGuardianDashboard(actor, query.studentId);

  if (!selected) {
    return (
      <>
        <PageHeader title="Family" />
        <EmptyState title="No students linked to your account">
          Ask the school office to link your guardian record to your child.
        </EmptyState>
      </>
    );
  }

  const { student, courses, gradeSummary, attendanceSummary, recentlyGraded, interventions, sharedNotes, notifications, links } =
    selected;

  return (
    <>
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`Grade ${student.gradeLevel}`}
      />

      {students.length > 1 ? (
        <Card>
          <CardHeader title="Child" />
          <form className="form-grid" method="get">
            <label className="ui-field">
              <span>Viewing</span>
              <select name="studentId" defaultValue={student.id}>
                {students.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.firstName} {option.lastName}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button className="ui-button ui-button--secondary" type="submit">View</button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="metric-row">
        <Stat label="Overall average" value={percent(gradeSummary.average)} tone={gradeSummary.average !== null && gradeSummary.average < 70 ? "danger" : "good"} />
        <Stat label="Missing work" value={gradeSummary.missingCount} tone={gradeSummary.missingCount > 0 ? "warn" : "good"} />
        <Stat label="Absences" value={attendanceSummary.absent} tone={attendanceSummary.absent >= 5 ? "danger" : "good"} />
        <Stat label="Attendance" value={percent(attendanceSummary.attendanceRate)} tone="info" />
      </div>

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Courses">
              Per-course averages — a single overall figure hides which subject needs attention.
            </CardHeader>
            <DataTable>
              <thead><tr><th>Course</th><th>Teacher</th><th>Average</th><th>Missing</th></tr></thead>
              <tbody>
                {courses.map(({ enrollment, courseTitle, teacherName, summary }) => (
                  <tr key={enrollment.id}>
                    <td>{courseTitle}</td>
                    <td>{teacherName}</td>
                    <td>{percent(summary.average)}</td>
                    <td>{summary.missingCount}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>

          <Card>
            <CardHeader title="Recently graded" />
            {recentlyGraded.length === 0 ? (
              <EmptyState title="Nothing graded yet" />
            ) : (
              <DataTable>
                <thead><tr><th>Assignment</th><th>Course</th><th>Score</th><th>Feedback</th></tr></thead>
                <tbody>
                  {recentlyGraded.map((submission) => (
                    <tr key={submission.id}>
                      <td>{submission.assignment.title}</td>
                      <td>{submission.assignment.classSection.course.title}</td>
                      <td>{submission.score} / {submission.assignment.pointsPossible}</td>
                      <td>{submission.feedback ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          {interventions.length > 0 ? (
            <Card>
              <CardHeader title="Support plans">
                Summary only. Speak to the school for the full plan.
              </CardHeader>
              <ul className="list">
                {interventions.map((plan) => (
                  <li key={plan.id}>
                    <strong>{plan.riskArea}</strong> · follow-up {formatDate(plan.followUpDate)}
                    <p>{plan.summary}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {sharedNotes.length > 0 ? (
            <Card>
              <CardHeader title="Notes shared with you" />
              <ul className="list">
                {sharedNotes.map((note) => (
                  <li key={note.id}>
                    <strong>{note.noteType}</strong>
                    <p>{note.content}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        <div className="stack">
          <Card>
            <CardHeader title="Contact preferences" />
            {links.map((link) => (
              <ActionForm key={link.id} action={updateGuardianPreferences} className="stack">
                <input type="hidden" name="studentId" value={student.id} />
                <label className="ui-field">
                  <span>Weekly progress digest</span>
                  <input type="checkbox" name="receivesDigest" defaultChecked={link.receivesDigest} />
                </label>
                <p className="muted">
                  {/* isPrimary and emergencyContact are staff-managed. A parent
                      quietly making themselves the emergency contact, or
                      demoting the other parent, is a safeguarding matter rather
                      than a preference. */}
                  Primary contact and emergency contact are managed by the school office.
                </p>
                <SubmitButton variant="primary">Save preferences</SubmitButton>
              </ActionForm>
            ))}
          </Card>

          <Card>
            <CardHeader title="Messages" />
            {notifications.length === 0 ? (
              <EmptyState title="No messages yet" />
            ) : (
              <ul className="list">
                {notifications.map((notification) => (
                  <li key={notification.id}>
                    <strong>{notification.title}</strong> <StatusBadge value={notification.status} />
                    <p>{notification.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
