import { Card, CardHeader, DataTable, FilterBar, LinkButton, PageHeader, Pagination } from "@agentic-edu/ui";
import { prisma } from "@agentic-edu/db";
import { parseEnumParam, parseListParams, buildPagination, withParam } from "@agentic-edu/shared";
import { scoreTeacherWorkload } from "@agentic-edu/domain";
import { StatusBadge } from "@/components/status-badge";

const EMPLOYMENT_STATUSES = ["Active", "OnLeave", "Inactive"] as const;

type TeacherSearchParams = { q?: string; department?: string; status?: string; page?: string };

export default async function TeachersPage({ searchParams }: { searchParams?: Promise<TeacherSearchParams> }) {
  const params = (await searchParams) ?? {};
  const listParams = parseListParams(params);

  const where = {
    department: params.department ? { contains: params.department, mode: "insensitive" as const } : undefined,
    employmentStatus: parseEnumParam(params.status, EMPLOYMENT_STATUSES),
    ...(listParams.q
      ? {
          OR: [
            { firstName: { contains: listParams.q, mode: "insensitive" as const } },
            { lastName: { contains: listParams.q, mode: "insensitive" as const } },
            { email: { contains: listParams.q, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const total = await prisma.teacher.count({ where });
  const pagination = buildPagination(total, listParams);

  const teachers = await prisma.teacher.findMany({
    where,
    include: {
      sections: { include: { enrollments: true, assignments: { include: { submissions: true } } } }
    },
    orderBy: [{ department: "asc" }, { lastName: "asc" }],
    skip: pagination.skip,
    take: pagination.take
  });

  return (
    <>
      <PageHeader title="Teachers" description="Manage teacher records, assignments, workload, activity, and audit context." actions={<LinkButton href="/teachers/new" variant="primary">New teacher</LinkButton>} />
      <Card>
        <CardHeader title="Filters" />
        <FilterBar resetHref="/teachers">
          <label className="ui-field">
            <span>Search</span>
            <input name="q" placeholder="Name or email" defaultValue={params.q ?? ""} />
          </label>
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
        </FilterBar>
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
        <Pagination
          {...pagination}
          label="teachers"
          hrefFor={(page) => `/teachers${withParam(params, "page", page)}`}
        />
      </Card>
    </>
  );
}
