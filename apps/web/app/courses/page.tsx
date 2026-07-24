import { Card, CardHeader, DataTable, LinkButton, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { StatusBadge } from "@/components/status-badge";

export default async function CoursesPage() {
  const courses = await prisma.course.findMany({ include: { sections: true }, orderBy: [{ subject: "asc" }, { code: "asc" }] });
  return (
    <>
      <PageHeader title="Courses" description="Catalog-level course management with related class sections." actions={<LinkButton href="/courses/new" variant="primary">New course</LinkButton>} />
      <Card>
        <CardHeader title="Course Catalog" />
        <DataTable>
          <thead><tr><th>Code</th><th>Title</th><th>Subject</th><th>Grade</th><th>Status</th><th>Sections</th></tr></thead>
          <tbody>
            {courses.map((course) => (
              <tr key={course.id}>
                <td>{course.code}</td>
                <td><a href={`/courses/${course.id}`}>{course.title}</a></td>
                <td>{course.subject}</td>
                <td>{course.gradeLevel}</td>
                <td><StatusBadge value={course.status} /></td>
                <td>{course.sections.length}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
