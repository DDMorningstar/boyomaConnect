/** Recréé à chaque navigation : entrée douce des pages (désactivée si « réduire les animations »). */
export default function PublicTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-page">{children}</div>;
}
