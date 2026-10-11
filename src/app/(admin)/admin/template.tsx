/** Entrée douce de chaque page de la console (désactivée si « réduire les animations »). */
export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return <div className="motion-safe:animate-page">{children}</div>;
}
