import { Card, CardHeader, DataTable, LinkButton, PageHeader } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { scoreTeacherWorkload } from "@agentic-edu/domain";
import { StatusBadge } from "@/components/status-badge";

export default async function TeachersPage({ searchParams }: { searchParams?: Promise<{ department?: string; status?: string }> }) {
  const params = (await searchParams) ?? {};
  const teachers = await prisma.teacher.findMany({
    where: {
      department: params.department ? { contains: params.department, mode: "insensitive" } : undefined,
      employmentStatus: params.status ? (params.status as never) : undefined
    },
    include: {
      sections: { include: { enrollments: true, assignments: { include: { submissions: true } } } }
    },
    orderBy: [{ department: "asc" }, { lastName: "asc" }]
  });

  return (
    <>
      <PageHeader title="Teachers" description="Manage teacher records, assignments, workload, activity, and audit context." actions={<LinkButton href="/teachers/new" variant="primary">New teacher</LinkButton>} />
      <Card>
        <CardHeader title="Filters" />
        <form className="form-grid">
          <label className="ui-field">
            <span>Department</span>
            <input name="department" defaultValue={params.department ?? ""} />
          </label>
          <label className="ui-field">
            <span>Status</span>
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Any</option>
              <option value="Active">Active</option>
              <option value="OnLeave">On leave</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="ui-button ui-button--secondary" type="submit">Apply filters</button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title="Teacher Directory" />
        <DataTable>
          <thead>
            <tr>
              <th>Name</th>
              <th>Department</th>
              <th>Status</th>
              <th>Sections</th>
              <th>Students</th>
              <th>Workload</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => {
              const activeSections = teacher.sections.filter((section) => section.status === "Active");
              const students = new Set(activeSections.flatMap((section) => section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").map((enrollment) => enrollment.studentId)));
              const assignments = activeSections.flatMap((section) => section.assignments.filter((assignment) => assignment.status === "Published"));
              const ungraded = assignments.flatMap((assignment) => assignment.submissions).filter((submission) => submission.score === null).length;
              const workload = scoreTeacherWorkload({
                employmentStatus: teacher.employmentStatus,
                activeSectionCount: activeSections.length,
                studentCount: students.size,
                activeAssignmentCount: assignments.length,
                ungradedSubmissionCount: ungraded,
                highRiskStudentCount: 0
              });
              return (
                <tr key={teacher.id}>
                  <td>
                    <a href={`/teachers/${teacher.id}`}>{teacher.firstName} {teacher.lastName}</a>
                  </td>
                  <td>{teacher.department}</td>
                  <td><StatusBadge value={teacher.employmentStatus} /></td>
                  <td>{activeSections.length}</td>
                  <td>{students.size}</td>
                  <td>{workload.score} · {workload.level}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </Card>
    </>
  );
}
