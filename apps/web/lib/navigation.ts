import type { UserRole } from "@agentic-edu/shared";

export interface NavItem {
  label: string;
  href: string;
  /**
   * Roles allowed to open this route. Omitted means "everyone".
   *
   * Role lists rather than PermissionActions, because navigation is about
   * *reading* a page and `canPerform` only models writes. A Viewer can read the
   * gradebook but can write nothing at all, so gating nav on write permissions
   * would leave them with an empty sidebar.
   */
  roles?: UserRole[];
}

const STAFF: UserRole[] = ["Admin", "SchoolManager", "Teacher", "Advisor"];
const STAFF_AND_VIEWER: UserRole[] = [...STAFF, "Viewer"];
const OPERATORS: UserRole[] = ["Admin", "SchoolManager"];
const SUPPORT: UserRole[] = ["Admin", "SchoolManager", "Advisor"];

/**
 * The sidebar, as data.
 *
 * Previously this was a `const nav = [...] as const` inside layout.tsx that
 * rendered all 23 links for everyone — including a Student, who could see
 * Worker Jobs and the audit log. Moving it here makes it filterable and, more
 * importantly, testable.
 *
 * Student and Guardian are deliberately near-empty for now. Their real
 * destinations (/my-courses, /family) arrive in US-09 and US-08. Until those
 * exist, pointing them at the staff pages would show one family another
 * family's data — those pages are not scoped to the viewer yet. A short menu is
 * the honest state of the product.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/" },
  { label: "My Work", href: "/my-work", roles: [...OPERATORS, "Teacher"] },
  { label: "Family", href: "/family", roles: ["Guardian"] },
  { label: "Teachers", href: "/teachers", roles: STAFF_AND_VIEWER },
  { label: "Students", href: "/students", roles: STAFF_AND_VIEWER },
  { label: "Courses", href: "/courses", roles: STAFF_AND_VIEWER },
  { label: "Class Sections", href: "/sections", roles: STAFF_AND_VIEWER },
  { label: "Academic Terms", href: "/terms", roles: STAFF_AND_VIEWER },
  { label: "Enrollments", href: "/enrollments", roles: STAFF_AND_VIEWER },
  { label: "Assignments", href: "/assignments", roles: [...STAFF_AND_VIEWER, "Student"] },
  { label: "Rubrics", href: "/rubrics", roles: [...OPERATORS, "Teacher", "Viewer"] },
  { label: "Gradebook", href: "/gradebook", roles: STAFF_AND_VIEWER },
  { label: "Attendance", href: "/attendance", roles: STAFF_AND_VIEWER },
  { label: "At-Risk Students", href: "/at-risk", roles: STAFF_AND_VIEWER },
  { label: "Interventions", href: "/interventions", roles: [...SUPPORT, "Teacher", "Viewer"] },
  { label: "Approvals", href: "/approvals", roles: SUPPORT },
  { label: "Guardians", href: "/guardians", roles: SUPPORT },
  { label: "Notifications", href: "/notifications" },
  { label: "Jobs", href: "/jobs", roles: OPERATORS },
  { label: "Worker Jobs", href: "/worker-jobs", roles: OPERATORS },
  { label: "Logs", href: "/logs", roles: [...OPERATORS, "Viewer"] },
  { label: "Agent Runs", href: "/agent-runs", roles: STAFF_AND_VIEWER },
  { label: "Agent Ops", href: "/agent-ops", roles: OPERATORS },
  { label: "Agent Recommendations", href: "/agent-recommendations", roles: [...SUPPORT, "Teacher"] },
  { label: "Audit Events", href: "/audit-events", roles: [...OPERATORS, "Viewer"] },
  { label: "Settings", href: "/settings" }
];

export function navItemsForRole(role: UserRole): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role));
}

/**
 * Whether a role may open a route, used by pages to refuse direct navigation.
 *
 * Unknown routes return `true` on purpose. This map covers the sidebar, not
 * every route in the app — detail pages like /students/[id] are reached from a
 * list the role could already see, and a missing entry here must not silently
 * lock someone out of a page nobody remembered to register.
 *
 * That is a deliberate fail-open, and it is only defensible because this
 * function guards *rendering*, never data mutation. Mutations are guarded by
 * assertCan in the service layer, which fails closed.
 */
export function canViewRoute(role: UserRole, href: string): boolean {
  const item = NAV_ITEMS.find((candidate) => candidate.href === href);
  if (!item || !item.roles) return true;
  return item.roles.includes(role);
}
