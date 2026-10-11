import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-[transform,background-color] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
const variants: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-[var(--shadow-float)]",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
  ...props
}: { href: string; variant?: Variant; className?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Link>,
  "href" | "className"
>) {
  return (
    <Link href={href} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </Link>
  );
}
