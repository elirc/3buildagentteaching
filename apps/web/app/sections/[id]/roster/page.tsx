import { notFound } from "next/navigation";
import { Card, CardHeader, DataTable, EmptyState, PageHeader, Stat } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { guardStaffRecord } from "@/components/route-guard";
import { getActorCapabilities } from "@/lib/capabilities";
import { formatDate } from "@/lib/format";
import { bulkEnroll, dropEnrollment, promoteFromWaitlist } from "@/lib/actions";

export default async function SectionRosterPage({ params }: { params: Promise<{ id: string }> }) {
  const denied = await guardStaffRecord();
  if (denied) return denied;

  const { id } = await params;
  const { can } = await getActorCapabilities();

  const section = await prisma.classSection.findUnique({
    where: { id },
    include: {
      course: true,
      teacher: true,
      enrollments: { include: { student: true }, orderBy: { enrolledAt: "asc" } }
    }
  });
  if (!section) notFound();

  const enrolled = section.enrollments.filter((e) => e.status === "Enrolled");
  // enrolledAt ascending is the waitlist order — first to ask is first offered
  // a seat. Any other order would need a policy nobody has written down.
  const waitlisted = section.enrollments.filter((e) => e.status === "Waitlisted");
  const seatsOpen = Math.max(0, section.capacity - enrolled.length);

  const onRoster = new Set(section.enrollments.filter((e) => e.status !== "Dropped").map((e) => e.studentId));
  const candidates = await prisma.student.findMany({
    where: { id: { notIn: [...onRoster] }, enrollmentStatus: { in: ["Active", "Probation"] } },
    orderBy: [{ gradeLevel: "asc" }, { lastName: "asc" }]
  });

  const canManage = can("enrollment:manage");
  const canPromote = can("enrollment:promote");

  return (
    <>
      <PageHeader
        title={`Roster · ${section.course.title}`}
        description={`${section.term} · ${section.teacher.firstName} ${section.teacher.lastName}`}
        actions={<a className="ui-button ui-button--secondary" href={`/sections/${section.id}/attendance`}>Take attendance</a>}
      />

      <div className="metric-row">
        <Stat label="Seats used" value={`${enrolled.length} of ${section.capacity}`} tone={seatsOpen === 0 ? "warn" : "good"} />
        <Stat label="Seats open" value={seatsOpen} tone={seatsOpen > 0 ? "good" : "neutral"} />
        <Stat label="Waitlisted" value={waitlisted.length} tone={waitlisted.length > 0 ? "warn" : "neutral"} />
      </div>

      {seatsOpen > 0 && waitlisted.length > 0 ? (
        <p className="form-error" role="alert">
          <strong>{seatsOpen} seat(s) open.</strong> {waitlisted.length} student(s) waiting — promote the next in line below.
        </p>
      ) : null}

      <div className="split" style={{ marginTop: "var(--space-4)" }}>
        <div className="stack">
          <Card>
            <CardHeader title="Enrolled" />
            {enrolled.length === 0 ? (
              <EmptyState title="Nobody enrolled yet" />
            ) : (
              <DataTable>
                <thead><tr><th>Student</th><th>Enrolled</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {enrolled.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td><a href={`/students/${enrollment.studentId}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a></td>
                      <td>{formatDate(enrollment.enrolledAt)}</td>
                      <td><StatusBadge value={enrollment.status} /></td>
                      <td>
                        <ActionForm action={dropEnrollment}>
                          <input type="hidden" name="id" value={enrollment.id} />
                          <SubmitButton variant="danger" disabled={!canManage}>Drop</SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          <Card>
            <CardHeader title="Waitlist">
              In the order students asked. Promotion is a staffing decision, so nothing happens automatically.
            </CardHeader>
            {waitlisted.length === 0 ? (
              <EmptyState title="Nobody waiting" />
            ) : (
              <DataTable>
                <thead><tr><th></th><th>Student</th><th>Waiting since</th><th></th></tr></thead>
                <tbody>
                  {waitlisted.map((enrollment, index) => (
                    <tr key={enrollment.id}>
                      {/* Marking who is next makes the queue legible. Without
                          it the order looks arbitrary and gets second-guessed. */}
                      <td>{index === 0 ? <StatusBadge value="Next" /> : `#${index + 1}`}</td>
                      <td><a href={`/students/${enrollment.studentId}`}>{enrollment.student.firstName} {enrollment.student.lastName}</a></td>
                      <td>{formatDate(enrollment.enrolledAt)}</td>
                      <td>
                        <ActionForm action={promoteFromWaitlist}>
                          <input type="hidden" name="id" value={enrollment.id} />
                          <SubmitButton variant="primary" disabled={!canPromote || seatsOpen === 0}>Promote</SubmitButton>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
            {seatsOpen === 0 && waitlisted.length > 0 ? (
              <p className="muted">Promotion is disabled while the section is full.</p>
            ) : null}
          </Card>
        </div>

        <Card>
          <CardHeader title="Add students">
            Each student is decided separately — one ineligible student does not fail the rest.
          </CardHeader>
          {candidates.length === 0 ? (
            <EmptyState title="No eligible students">Every active student is already on this roster.</EmptyState>
          ) : (
            <ActionForm action={bulkEnroll} className="stack" errorPlacement="bottom">
              <input type="hidden" name="classSectionId" value={section.id} />
              <div className="stack" style={{ maxHeight: "22rem", overflowY: "auto" }}>
                {candidates.map((student) => (
                  <label key={student.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {/* Shared name; the action reads it with formData.getAll. */}
                    <input type="checkbox" name="studentIds" value={student.id} disabled={!canManage} />
                    {student.firstName} {student.lastName} · Grade {student.gradeLevel} · {student.enrollmentStatus}
                  </label>
                ))}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="allowWaitlist" disabled={!canManage} /> Waitlist anyone who does not fit
              </label>
              <SubmitButton variant="primary" disabled={!canManage}>Enrol selected</SubmitButton>
              {!canManage ? <p className="muted">Roster changes are limited to administrators.</p> : null}
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
