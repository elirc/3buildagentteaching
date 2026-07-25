import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import clsx from "clsx";

export function Button({
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  return (
    <button className={clsx("ui-button", `ui-button--${variant}`)} {...props}>
      {children}
    </button>
  );
}

export function LinkButton({
  children,
  href,
  variant = "secondary"
}: {
  children: ReactNode;
  href: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  return (
    <a className={clsx("ui-button", `ui-button--${variant}`)} href={href}>
      {children}
    </a>
  );
}

export function Card({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={clsx("ui-card", className)} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  eyebrow,
  actions,
  children
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="ui-card-header">
      <div>
        {eyebrow ? <div className="ui-eyebrow">{eyebrow}</div> : null}
        <h2>{title}</h2>
        {children ? <p>{children}</p> : null}
      </div>
      {actions ? <div className="ui-actions">{actions}</div> : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "danger" | "info" }) {
  return <span className={clsx("ui-badge", `ui-badge--${tone}`)}>{children}</span>;
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">{children}</table>
    </div>
  );
}

export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="ui-actions">{actions}</div> : null}
    </header>
  );
}

export function Stat({ label, value, tone = "neutral" }: { label: string; value: ReactNode; tone?: "neutral" | "good" | "warn" | "danger" | "info" }) {
  return (
    <div className={clsx("ui-stat", `ui-stat--${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return <pre className="ui-json">{JSON.stringify(value, null, 2)}</pre>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="ui-empty">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/**
 * Paging footer for a list page.
 *
 * Plain links, not buttons. That means the browser's back button works, a page
 * is bookmarkable, and the whole thing keeps functioning with JavaScript
 * disabled — which matters here because every page in this app is a Server
 * Component and paging is the one interaction that does not need a client
 * bundle at all.
 *
 * `hrefFor` is supplied by the caller rather than being built in, because only
 * the caller knows which other query params must survive the click.
 */
export function Pagination({
  page,
  totalPages,
  total,
  firstRow,
  lastRow,
  hasPrevious,
  hasNext,
  hrefFor,
  label = "results"
}: {
  page: number;
  totalPages: number;
  total: number;
  firstRow: number;
  lastRow: number;
  hasPrevious: boolean;
  hasNext: boolean;
  hrefFor: (page: number) => string;
  label?: string;
}) {
  if (total === 0) return null;

  return (
    <nav className="ui-pagination" aria-label="Pagination">
      <span className="muted">
        Showing {firstRow}–{lastRow} of {total} {label}
      </span>
      <span className="ui-pagination-controls">
        {hasPrevious ? (
          <a className="ui-button ui-button--ghost" href={hrefFor(page - 1)} rel="prev">
            ‹ Previous
          </a>
        ) : (
          <span className="ui-button ui-button--ghost is-disabled" aria-disabled="true">
            ‹ Previous
          </span>
        )}
        <span className="muted">
          Page {page} of {totalPages}
        </span>
        {hasNext ? (
          <a className="ui-button ui-button--ghost" href={hrefFor(page + 1)} rel="next">
            Next ›
          </a>
        ) : (
          <span className="ui-button ui-button--ghost is-disabled" aria-disabled="true">
            Next ›
          </span>
        )}
      </span>
    </nav>
  );
}

/**
 * A GET form wrapping filter controls.
 *
 * `method="get"` is the entire trick: the browser serialises the fields into
 * the query string for us, so filter state lives in the URL with no client
 * JavaScript and no state management. Shareable, bookmarkable, back-button
 * friendly.
 *
 * The hidden `page` reset is the non-obvious part — see the comment below.
 */
export function FilterBar({ children, resetHref }: { children: ReactNode; resetHref?: string }) {
  return (
    <form className="form-grid" method="get">
      {/*
        Applying a new filter must return to page 1. Without this, a user on
        page 6 who narrows the search to 3 results lands on page 6 of 1 and sees
        an empty table. buildPagination would clamp it, but resetting here is
        clearer than relying on a downstream rescue.
      */}
      <input type="hidden" name="page" value="1" />
      {children}
      <div className="form-actions">
        <button className="ui-button ui-button--secondary" type="submit">
          Apply
        </button>
        {resetHref ? (
          <a className="ui-button ui-button--ghost" href={resetHref}>
            Reset
          </a>
        ) : null}
      </div>
    </form>
  );
}
