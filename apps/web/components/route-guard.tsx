import { EmptyState, PageHeader } from "@agentic-edu/ui";
import { ROLE_LABELS } from "@agentic-edu/shared";
import { canViewRoute } from "@/lib/navigation";
import { getActorCapabilities } from "@/lib/capabilities";

/**
 * Refuses to render a page the acting role should not see.
 *
 * Used at the top of operational pages:
 *
 *   const denied = await guardRoute("/jobs");
 *   if (denied) return denied;
 *
 * Returning JSX rather than calling notFound() is deliberate. A 404 tells the
 * user the page does not exist, which is a lie that wastes their time — they
 * will retype the URL, ask a colleague, and file a bug. "You do not have access
 * to this view" tells them the truth and names the role they are currently
 * acting as, which in a dev-switcher app is very often the actual problem.
 *
 * Hiding the existence of a resource is a real technique, but it is for cases
 * where the resource's *name* is itself sensitive. "This school runs background
 * jobs" is not a secret worth lying about.
 */
export async function guardRoute(href: string) {
  const { actor } = await getActorCapabilities();
  if (canViewRoute(actor.role, href)) return null;

  return (
    <>
      <PageHeader title="No access" description="This view is limited to certain roles." />
      <EmptyState title="You do not have access to this view">
        You are currently acting as <strong>{ROLE_LABELS[actor.role]}</strong>. Switch to a role with
        access using the user switcher in the top bar, or ask an administrator.
      </EmptyState>
    </>
  );
}

/**
 * Refuses a *record* page to roles that should never open one.
 *
 * guardRoute answers "may this role open this route", keyed on the sidebar. It
 * cannot answer "may this role open /students/student_maya", because detail
 * routes are not in the sidebar — they are reached from a list, and
 * canViewRoute deliberately fails open for anything it does not know.
 *
 * That fail-open is fine for a Teacher opening a student they teach. It is not
 * fine for a Student or Guardian, who have their own scoped portals
 * (/my-courses, /family) and no business on a staff record page at all — where
 * they would see AdvisorOnly support notes, intervention actions, agent output
 * and the full audit history.
 *
 * Before this, the staff pages were protected only by not being linked from
 * those roles' navigation. Typing the URL worked.
 */
export async function guardStaffRecord() {
  const { actor } = await getActorCapabilities();
  const isFamily = actor.role === "Student" || actor.role === "Guardian";
  if (!isFamily) return null;

  const destination = actor.role === "Student" ? "/my-courses" : "/family";

  return (
    <>
      <PageHeader title="No access" description="Staff record pages are limited to school staff." />
      <EmptyState title="You do not have access to this view">
        You are acting as <strong>{ROLE_LABELS[actor.role]}</strong>. Your own view is{" "}
        <a href={destination}>{destination}</a>.
      </EmptyState>
    </>
  );
}
