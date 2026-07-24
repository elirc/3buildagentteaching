import { Card, CardHeader, DataTable, LinkButton, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";

export default async function SectionsPage() {
  const sections = await prisma.classSection.findMany({
    include: { course: true, teacher: true, enrollments: true, assignments: true },
    orderBy: [{ term: "desc" }, { room: "asc" }]
  });
  return (
    <>
      <PageHeader title="Class Sections" description="Operational classes with teachers, rosters, schedules, assignments, attendance, and analytics." actions={<LinkButton href="/sections/new" variant="primary">New section</LinkButton>} />
      <Card>
        <CardHeader title="Sections" />
        <DataTable>
          <thead><tr><th>Course</th><th>Teacher</th><th>Term</th><th>Room</th><th>Status</th><th>Roster</th><th>Assignments</th></tr></thead>
          <tbody>
            {sections.map((section) => (
              <tr key={section.id}>
                <td><a href={`/sections/${section.id}`}>{section.course.title}</a></td>
                <td><a href={`/teachers/${section.teacher.id}`}>{section.teacher.firstName} {section.teacher.lastName}</a></td>
                <td>{section.term}</td>
                <td>{section.room}</td>
                <td><StatusBadge value={section.status} /></td>
                <td>{section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").length}/{section.capacity}</td>
                <td>{section.assignments.length}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
