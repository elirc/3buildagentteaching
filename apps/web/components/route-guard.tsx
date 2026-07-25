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
