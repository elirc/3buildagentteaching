import { Card, CardHeader, DataTable, FilterBar, LinkButton, PageHeader, Pagination } from "@agentic-edu/ui";
import { getStudentDirectory } from "@agentic-edu/application";
import { withParam } from "@agentic-edu/shared";
import { StatusBadge } from "@/components/status-badge";
import { percent } from "@/lib/format";

type StudentSearchParams = {
  q?: string;
  status?: string;
  grade?: string;
  page?: string;
};

export default async function StudentsPage({ searchParams }: { searchParams?: Promise<StudentSearchParams> }) {
  const params = (await searchParams) ?? {};
  const { rows, pagination } = await getStudentDirectory(params);

  return (
    <>
      <PageHeader
        title="Students"
        description="Student records, academic signals, attendance summaries, interventions, and audit context."
        actions={<LinkButton href="/students/new" variant="primary">New student</LinkButton>}
      />
      <Card>
        <CardHeader title="Filters" />
        <FilterBar resetHref="/students">
          <label className="ui-field">
            <span>Search</span>
            <input name="q" placeholder="Name, email, or student number" defaultValue={params.q ?? ""} />
          </label>
          <label className="ui-field">
            <span>Status</span>
            <select name="status" defaultValue={params.status ?? ""}>
              <option value="">Any</option>
              <option value="Active">Active</option>
              <option value="Probation">Probation</option>
              <option value="Withdrawn">Withdrawn</option>
              <option value="Graduated">Graduated</option>
            </select>
          </label>
          <label className="ui-field">
            <span>Grade level</span>
            <input name="grade" type="number" min="1" max="12" defaultValue={params.grade ?? ""} />
          </label>
        </FilterBar>
      </Card>
      <Card>
        <CardHeader title="Student Directory" />
        <DataTable>
          <thead>
            <tr><th>Name</th><th>Grade</th><th>Status</th><th>Average</th><th>Attendance</th><th>Risk</th></tr>
          </thead>
          <tbody>
            {rows.map(({ student, gradeSummary, attendanceSummary, risk }) => (
              <tr key={student.id}>
                <td><a href={`/students/${student.id}`}>{student.firstName} {student.lastName}</a></td>
                <td>{student.gradeLevel}</td>
                <td><StatusBadge value={student.enrollmentStatus} /></td>
                <td>{percent(gradeSummary.average)}</td>
                <td>{attendanceSummary.absent} absences · {attendanceSummary.tardy} tardies</td>
                <td><StatusBadge value={risk.level} /></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <Pagination
          {...pagination}
          label="students"
          hrefFor={(page) => `/students${withParam(params, "page", page)}`}
        />
      </Card>
    </>
  );
}
