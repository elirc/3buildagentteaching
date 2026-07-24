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
