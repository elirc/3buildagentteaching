import type { Metadata } from "next";
import "./globals.css";
import { ROLE_LABELS } from "@agentic-edu/shared";
import { DevUserSwitcher } from "@/components/dev-user-switcher";
import { getActorCapabilities } from "@/lib/capabilities";
import { navItemsForRole } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "Agentic Education Ops",
  description: "Internal education operations and learning management platform."
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The layout is already dynamic, so resolving the actor here costs one query
  // that every page underneath would otherwise repeat.
  const { actor } = await getActorCapabilities();
  const nav = navItemsForRole(actor.role);

  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <aside className="app-sidebar">
            <a className="app-brand" href="/">
              <strong>Agentic Education Ops</strong>
              <span>Modular monolith learning codebase</span>
            </a>
            <nav className="app-nav" aria-label="Main navigation">
              {nav.map((item) => (
                <a key={item.href} href={item.href}>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
          <main className="app-main">
            <div className="app-topbar">
              {/*
                Showing the acting role is not decoration. Every "why can't I do
                this?" in a role-switching app is answered by looking here, and
                before this the only place to find it was /settings.
              */}
              <span className="muted">
                Acting as <strong>{ROLE_LABELS[actor.role]}</strong>
              </span>
              <DevUserSwitcher />
            </div>
            <div className="app-content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
