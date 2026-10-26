import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Framed HUD panel with military corner brackets and a header strip. */
export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
  style,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={cn("relative border border-border bg-card/80", className)} style={style}>
      <span aria-hidden className="absolute -top-px -left-px h-2 w-2 border-t-2 border-l-2 border-primary" />
      <span aria-hidden className="absolute -top-px -right-px h-2 w-2 border-t-2 border-r-2 border-primary" />
      <span aria-hidden className="absolute -bottom-px -left-px h-2 w-2 border-b-2 border-l-2 border-primary" />
      <span aria-hidden className="absolute -bottom-px -right-px h-2 w-2 border-b-2 border-r-2 border-primary" />
      {title && (
        <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <h2 className="text-[11px] font-bold tracking-[0.2em] text-muted-foreground uppercase">{title}</h2>
          {right}
        </header>
      )}
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </section>
  );
}
