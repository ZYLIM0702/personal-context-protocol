"use client";

import type { ReactNode } from "react";
import { PageHeader } from "./Chrome";

export function Page({
  title,
  lede,
  actions,
  wide,
  children,
}: {
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="pc-page">
      <div className={wide ? "pc-page__inner pc-page__inner--wide" : "pc-page__inner"}>
        <PageHeader title={title} lede={lede} actions={actions} />
        {children}
      </div>
    </div>
  );
}

export function Panel({
  title,
  icon,
  aside,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `pc-panel ${className}` : "pc-panel"}>
      <header className="pc-panel__head">
        {icon ? (
          <span className="pc-panel__icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <h2>{title}</h2>
        {aside ? <div className="pc-panel__aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "warn" | "violet" }) {
  return <span className={`pc-tag pc-tag--${tone}`}>{children}</span>;
}
