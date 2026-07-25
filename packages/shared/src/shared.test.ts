import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildPagination,
  parseEnumParam,
  parseListParams,
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
