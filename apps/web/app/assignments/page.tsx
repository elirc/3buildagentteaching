import { Card, CardHeader, DataTable, LinkButton, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";

export default async function AssignmentsPage() {
  const assignments = await prisma.assignment.findMany({
    include: { classSection: { include: { course: true, teacher: true } }, submissions: true },
    orderBy: { dueDate: "desc" }
  });
  return (
    <>
      <PageHeader title="Assignments" description="Assignment publishing, submissions, grading, feedback, and agent review." actions={<LinkButton href="/assignments/new" variant="primary">New assignment</LinkButton>} />
      <Card>
        <CardHeader title="Assignment List" />
        <DataTable>
          <thead><tr><th>Assignment</th><th>Course</th><th>Teacher</th><th>Type</th><th>Status</th><th>Due</th><th>Submissions</th></tr></thead>
          <tbody>
            {assignments.map((assignment) => (
              <tr key={assignment.id}>
                <td><a href={`/assignments/${assignment.id}`}>{assignment.title}</a></td>
                <td>{assignment.classSection.course.title}</td>
                <td>{assignment.classSection.teacher.firstName} {assignment.classSection.teacher.lastName}</td>
                <td>{assignment.type}</td>
                <td><StatusBadge value={assignment.status} /></td>
                <td>{formatDate(assignment.dueDate)}</td>
                <td>{assignment.submissions.length}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
