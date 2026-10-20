import type { ReactNode } from "react";

export interface SettingsRowProps {
  /** The section anchor the settings index links to. */
  id: string;
  title: string;
  children: ReactNode;
}

/**
 * One flush settings row: a 230 px heading column and controls up to 640 px,
 * ruled off from the next row. Stacks below 768 px.
 */
export default function SettingsRow({ id, title, children }: SettingsRowProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="page-gutter grid scroll-mt-4 gap-4 border-b border-rule py-7 md:grid-cols-[230px_minmax(0,640px)] md:gap-10"
    >
      <h2 id={`${id}-title`} className="type-section m-0">
        {title}
      </h2>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
