import { describe, expect, it } from "vitest";
import { NAV_ITEMS, canViewRoute, navItemsForRole } from "./navigation";

/**
 * The sidebar is data, so it can be tested. Before US-02 it was a literal
 * inside layout.tsx and the only way to check who saw what was to log in as
 * each of the seven roles and read the screen.
 */
describe("navigation", () => {
  it("gives an Admin every link except the role-specific portals", () => {
    // Admin used to be a strict superset of every other role. US-08 broke that
    // on purpose: /family is scoped to a guardian's own children, so there is
    // nothing coherent for an Admin to see there — they look at /students.
    //
    // Portals are the exception to "Admin sees everything", and naming them
    // here means adding another one has to be a deliberate decision rather
    // than a silently failing test.
    const portals = ["/family"];
    const adminHrefs = navItemsForRole("Admin").map((item) => item.href);

    expect(adminHrefs).toHaveLength(NAV_ITEMS.length - portals.length);
    for (const portal of portals) {
      expect(adminHrefs).not.toContain(portal);
    }
    // Everything that is not a portal must still be reachable.
    for (const item of NAV_ITEMS) {
      if (!portals.includes(item.href)) expect(adminHrefs).toContain(item.href);
    }
  });

  it("keeps operational tooling away from a Viewer", () => {
    const hrefs = navItemsForRole("Viewer").map((item) => item.href);

    // A Viewer observes; they never touch the queue or the agent control plane.
    expect(hrefs).not.toContain("/jobs");
    expect(hrefs).not.toContain("/worker-jobs");
    expect(hrefs).not.toContain("/agent-ops");

    // But read-only views stay available, otherwise the role is pointless.
    expect(hrefs).toContain("/gradebook");
    expect(hrefs).toContain("/logs");
  });

  it("gives a Guardian their own scoped destination", () => {
    // US-08 shipped /family, which IS scoped to their children.
    expect(navItemsForRole("Guardian").map((item) => item.href)).toContain("/family");
    expect(navItemsForRole("Teacher").map((item) => item.href)).not.toContain("/family");
  });

  it("does not show a Student or Guardian anyone else's data", () => {
    // /my-courses (US-09) does not exist yet, so Student stays short. Neither
    // role gets a school-wide list page.
    for (const role of ["Student", "Guardian"] as const) {
      const hrefs = navItemsForRole(role).map((item) => item.href);
      expect(hrefs).not.toContain("/students");
      expect(hrefs).not.toContain("/gradebook");
      expect(hrefs).not.toContain("/at-risk");
      expect(hrefs).not.toContain("/audit-events");
      expect(hrefs).not.toContain("/my-work");
      // They can still see the dashboard, their notifications, and settings.
      expect(hrefs).toContain("/notifications");
    }
  });

  it("a Teacher can reach instruction pages but not the audit log", () => {
    const hrefs = navItemsForRole("Teacher").map((item) => item.href);
    expect(hrefs).toContain("/my-work");
    expect(hrefs).toContain("/gradebook");
    expect(hrefs).toContain("/rubrics");
    expect(hrefs).toContain("/agent-recommendations");
    expect(hrefs).not.toContain("/audit-events");
    expect(hrefs).not.toContain("/worker-jobs");
  });

  it("canViewRoute agrees with the sidebar it is derived from", () => {
    // Guarding and listing must never disagree, or a role sees a link that
    // then refuses to open.
    for (const role of ["Admin", "SchoolManager", "Teacher", "Advisor", "Student", "Guardian", "Viewer"] as const) {
      for (const item of NAV_ITEMS) {
        const listed = navItemsForRole(role).some((candidate) => candidate.href === item.href);
        expect(canViewRoute(role, item.href)).toBe(listed);
      }
    }
  });

  it("fails open for routes that are not in the sidebar", () => {
    // Detail pages are reached from a list the role could already see, and an
    // unregistered route must not silently lock someone out. This is only safe
    // because the function guards rendering, never mutation.
    expect(canViewRoute("Student", "/students/student_maya")).toBe(true);
  });
});
