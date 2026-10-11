import type { ReactNode } from "react";

export function InfoPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl pt-6">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {intro && <p className="mt-2 text-muted">{intro}</p>}
      <div className="mt-6 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </div>
  );
}
