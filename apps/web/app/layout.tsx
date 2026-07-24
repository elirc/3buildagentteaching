import type { Metadata } from "next";
import "./globals.css";
import { DevUserSwitcher } from "@/components/dev-user-switcher";

export const metadata: Metadata = {
  title: "Agentic Education Ops",
  description: "Internal education operations and learning management platform."
};

export const dynamic = "force-dynamic";

const nav = [
  ["Dashboard", "/"],
  ["Teachers", "/teachers"],
  ["Students", "/students"],
  ["Courses", "/courses"],
  ["Class Sections", "/sections"],
  ["Academic Terms", "/terms"],
  ["Enrollments", "/enrollments"],
  ["Assignments", "/assignments"],
  ["Rubrics", "/rubrics"],
  ["Gradebook", "/gradebook"],
  ["Attendance", "/attendance"],
  ["At-Risk Students", "/at-risk"],
  ["Interventions", "/interventions"],
  ["Approvals", "/approvals"],
  ["Guardians", "/guardians"],
  ["Notifications", "/notifications"],
  ["Jobs", "/jobs"],
  ["Worker Jobs", "/worker-jobs"],
  ["Logs", "/logs"],
  ["Agent Runs", "/agent-runs"],
  ["Agent Ops", "/agent-ops"],
  ["Agent Recommendations", "/agent-recommendations"],
  ["Audit Events", "/audit-events"]
] as const;

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
              {nav.map(([label, href]) => (
                <a key={href} href={href}>
                  {label}
                </a>
              ))}
            </nav>
          </aside>
          <main className="app-main">
            <div className="app-topbar">
              <span className="muted">Local development user simulation</span>
              <DevUserSwitcher />
            </div>
            <div className="app-content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
