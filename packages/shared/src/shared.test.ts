import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPagination,
  escapeCsvValue,
  parseEnumParam,
  parseListParams,
  toCsv,
  withParam
} from "./index";

describe("parseListParams", () => {
  it("applies defaults when nothing is supplied", () => {
    expect(parseListParams()).toEqual({ q: null, page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it("refuses every way a hand-edited page number can be wrong", () => {
    // These are not hypothetical — they are what actually arrives when someone
    // edits the address bar or a crawler follows a mangled link.
    for (const page of ["0", "-1", "abc", "", "NaN", "1e9999"]) {
      const parsed = parseListParams({ page });
      expect(parsed.page).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(parsed.page)).toBe(true);
    }
    expect(parseListParams({ page: "0" }).page).toBe(1);
    expect(parseListParams({ page: "-1" }).page).toBe(1);
    expect(parseListParams({ page: "abc" }).page).toBe(1);
    expect(parseListParams({ page: "7" }).page).toBe(7);
  });

  it("caps pageSize so a query string cannot request the whole table", () => {
    expect(parseListParams({ pageSize: "100000" }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(parseListParams({ pageSize: "10" }).pageSize).toBe(10);
    expect(parseListParams({ pageSize: "0" }).pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("treats a whitespace-only search as no search", () => {
    expect(parseListParams({ q: "   " }).q).toBeNull();
    expect(parseListParams({ q: "  maya " }).q).toBe("maya");
  });
});

describe("buildPagination", () => {
  it("computes offsets and row labels for a middle page", () => {
    const page = buildPagination(120, { q: null, page: 3, pageSize: 25 });
    expect(page).toMatchObject({
      page: 3,
      totalPages: 5,
      skip: 50,
      take: 25,
      hasPrevious: true,
      hasNext: true,
      firstRow: 51,
      lastRow: 75
    });
  });

  it("reports the true last row on a partial final page", () => {
    const page = buildPagination(52, { q: null, page: 3, pageSize: 25 });
    expect(page.firstRow).toBe(51);
    expect(page.lastRow).toBe(52);
    expect(page.hasNext).toBe(false);
  });

  it("clamps a page past the end back to the last populated page", () => {
    // The bug this prevents: delete the only row on page 4, get redirected back
    // to ?page=4, and stare at an empty table with no way to navigate out.
    const page = buildPagination(30, { q: null, page: 99, pageSize: 25 });
    expect(page.page).toBe(2);
    expect(page.skip).toBe(25);
    expect(page.hasNext).toBe(false);
  });

  it("stays coherent when there is nothing to show", () => {
    const page = buildPagination(0, { q: null, page: 1, pageSize: 25 });
    expect(page).toMatchObject({
      page: 1,
      totalPages: 1,
      skip: 0,
      hasPrevious: false,
      hasNext: false,
      firstRow: 0,
      lastRow: 0
    });
  });
});

describe("withParam", () => {
  it("keeps existing filters when changing the page", () => {
    // If this drops a key, "next page" silently resets the user's search.
    const qs = withParam({ status: "Active", grade: "9", page: "2" }, "page", 3);
    const parsed = new URLSearchParams(qs.slice(1));
    expect(parsed.get("status")).toBe("Active");
    expect(parsed.get("grade")).toBe("9");
    expect(parsed.get("page")).toBe("3");
  });

  it("removes a key when the value is cleared", () => {
    expect(withParam({ status: "Active" }, "status", null)).toBe("");
  });

  it("drops empty values rather than emitting status=", () => {
    const qs = withParam({ status: "", grade: "9" }, "page", 2);
    expect(qs).not.toContain("status=");
  });
});

describe("parseEnumParam", () => {
  const statuses = ["Active", "Probation", "Withdrawn", "Graduated"] as const;

  it("passes through a known member", () => {
    expect(parseEnumParam("Probation", statuses)).toBe("Probation");
  });

  it("ignores anything else instead of forwarding it to the database", () => {
    // This is the `as never` bug: the cast let ?status=DROP reach Prisma.
    // A bad filter should not error — it should simply not filter.
    expect(parseEnumParam("DROP", statuses)).toBeUndefined();
    expect(parseEnumParam("", statuses)).toBeUndefined();
    expect(parseEnumParam(undefined, statuses)).toBeUndefined();
  });
});

describe("escapeCsvValue", () => {
  it("quotes values containing a comma, a quote, or a newline", () => {
    expect(escapeCsvValue("Johnson, Maya")).toBe('"Johnson, Maya"');
    expect(escapeCsvValue('She said "hello"')).toBe('"She said ""hello"""');
    expect(escapeCsvValue("line one\nline two")).toBe('"line one\nline two"');
  });

  it("leaves ordinary values alone", () => {
    expect(escapeCsvValue("Maya Johnson")).toBe("Maya Johnson");
    expect(escapeCsvValue(88)).toBe("88");
    expect(escapeCsvValue(null)).toBe("");
    expect(escapeCsvValue(undefined)).toBe("");
  });

  it("neutralises formula injection", () => {
    /*
     * The attack: a value beginning =, +, - or @ is evaluated as a formula by
     * Excel, Sheets and LibreOffice. A student name or a support note pasted
     * from somewhere hostile becomes executable the moment an administrator
     * opens the export. A leading apostrophe makes the cell text.
     */
    // Note it is *not* quoted: single quotes and pipes are not CSV-special, so
    // the prefix alone is the whole defusal. Quoting it as well would be
    // harmless but would mean the escaping rule and the injection rule had been
    // conflated, and only one of them is about CSV syntax.
    expect(escapeCsvValue("=cmd|'/c calc'!A0")).toBe("'=cmd|'/c calc'!A0");
    expect(escapeCsvValue("+1234")).toBe("'+1234");
    // Both rules together: the leading = is defused *and* the comma is quoted.
    expect(escapeCsvValue("=SUM(1,2)")).toBe(`"'=SUM(1,2)"`);
    expect(escapeCsvValue("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    // Negative numbers get the prefix too. Slightly ugly output beats a
    // document that can run code, and the rule has to be about the leading
    // character rather than about what we believe the type to be.
    expect(escapeCsvValue("-5")).toBe("'-5");
  });
});

describe("toCsv", () => {
  it("renders a header row and one row per record, CRLF separated", () => {
    const rows = [
      { name: "Maya Johnson", score: 88 },
      { name: "Liam Brooks", score: null }
    ];
    const csv = toCsv(rows, [
      { header: "Student", value: (row) => row.name },
      { header: "Score", value: (row) => row.score }
    ]);

    expect(csv).toBe("Student,Score\r\nMaya Johnson,88\r\nLiam Brooks,");
  });

  it("escapes headers as well as values", () => {
    // Headers are usually literals, but they are not always: a column per
    // grading period takes its name from user data.
    const csv = toCsv([{ v: 1 }], [{ header: 'Q1, "midterm"', value: (row) => row.v }]);
    expect(csv.split("\r\n")[0]).toBe('"Q1, ""midterm"""');
  });

  it("produces only a header row for an empty set", () => {
    expect(toCsv([], [{ header: "Student", value: () => "" }])).toBe("Student");
  });
});
