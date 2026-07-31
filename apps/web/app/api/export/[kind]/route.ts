import { NextResponse } from "next/server";
import {
  getAtRiskStudentQueue,
  getReportWithDiff,
  getSectionGradebook
} from "@agentic-edu/application";
import { toCsv, type CsvColumn } from "@agentic-edu/shared";
import { canPerform } from "@agentic-edu/domain";
import { getCurrentActor } from "@/lib/current-user";

/**
 * CSV downloads.
 *
 * A route handler rather than a Server Action because the response *is* a file:
 * it needs its own Content-Type and a Content-Disposition header, and a Server
 * Action returns a value to a form. This is the case route handlers are for.
 *
 * Authorization is re-checked here and not inherited from the page that
 * rendered the link. A URL is not a session — this endpoint is reachable by
 * anyone who can type it, and an export of every at-risk student is precisely
 * the kind of thing that must not be one guessed URL away.
 */
export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const actor = await getCurrentActor();

  // The same authority the pages themselves require. Viewer and Student roles
  // can read neither, so they cannot export either.
  if (!canPerform(actor, "intervention:create", {})) {
    return new NextResponse("Not allowed to export this data.", { status: 403 });
  }

  const url = new URL(request.url);

  if (kind === "at-risk") {
    const queue = await getAtRiskStudentQueue();
    return csvResponse("at-risk-students", queue, [
      { header: "Student", value: (row) => `${row.student.firstName} ${row.student.lastName}` },
      { header: "Grade level", value: (row) => row.student.gradeLevel },
      { header: "Risk score", value: (row) => row.risk.score },
      { header: "Risk level", value: (row) => row.risk.level },
      { header: "Primary areas", value: (row) => row.risk.primaryAreas.join("; ") },
      { header: "Grade average", value: (row) => (row.gradeSummary.average === null ? "" : Math.round(row.gradeSummary.average)) },
      { header: "Missing", value: (row) => row.gradeSummary.missingCount },
      { header: "Absences", value: (row) => row.attendanceSummary.absent }
    ]);
  }

  if (kind === "gradebook") {
    const gradebooks = await getSectionGradebook();
    const rows = gradebooks.flatMap((book) =>
      book.rows.map((row) => ({ book, row }))
    );
    return csvResponse("gradebook", rows, [
      { header: "Section", value: ({ book }) => `${book.section.course.code} ${book.section.academicTerm.name}` },
      { header: "Teacher", value: ({ book }) => `${book.section.teacher.firstName} ${book.section.teacher.lastName}` },
      { header: "Student", value: ({ row }) => `${row.enrollment.student.firstName} ${row.enrollment.student.lastName}` },
      { header: "Weighted", value: ({ row }) => (row.summary.weightedAverage === null ? "" : Math.round(row.summary.weightedAverage)) },
      { header: "Unweighted", value: ({ row }) => (row.summary.average === null ? "" : Math.round(row.summary.average)) },
      { header: "Band", value: ({ row }) => row.summary.performanceBand },
      { header: "Missing", value: ({ row }) => row.summary.missingCount },
      { header: "Late", value: ({ row }) => row.summary.lateCount },
      { header: "Trend", value: ({ row }) => row.summary.trend }
    ]);
  }

  if (kind === "report") {
    const id = url.searchParams.get("id");
    if (!id) return new NextResponse("Missing report id.", { status: 400 });

    const found = await getReportWithDiff(id);
    if (!found) return new NextResponse("Report not found.", { status: 404 });

    return csvResponse(`report-${id}`, found.payload.rows, [
      { header: "Student", value: (row) => row.studentName },
      { header: "Grade level", value: (row) => row.gradeLevel },
      { header: "Risk score", value: (row) => row.riskScore },
      { header: "Risk level", value: (row) => row.riskLevel },
      { header: "Primary areas", value: (row) => row.primaryRiskAreas.join("; ") },
      { header: "Grade average", value: (row) => row.gradeAverage },
      { header: "Missing", value: (row) => row.missingCount },
      { header: "Absences", value: (row) => row.absences },
      { header: "Active interventions", value: (row) => row.activeInterventionCount },
      { header: "Advisor", value: (row) => row.advisorName }
    ]);
  }

  return new NextResponse(`Unknown export "${kind}".`, { status: 404 });
}

function csvResponse<T>(name: string, rows: readonly T[], columns: ReadonlyArray<CsvColumn<T>>) {
  return new NextResponse(toCsv(rows, columns), {
    headers: {
      // charset matters: without it Excel mis-decodes non-ASCII names.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      // A snapshot download should never be served from a cache belonging to a
      // different user's session.
      "Cache-Control": "no-store"
    }
  });
}

export const dynamic = "force-dynamic";
