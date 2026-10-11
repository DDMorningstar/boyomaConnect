import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { PwaManager } from "@/components/layout/pwa";
import { env } from "@/lib/env";
import "@/styles/globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: { default: "Boyoma Connect — Votre ville. Vos adresses. Votre chemin.", template: "%s · Boyoma Connect" },
  description:
    "Trouvez, contactez et localisez pharmacies, hôtels, restaurants, garages, écoles et services à Kisangani.",
  applicationName: "Boyoma Connect",
  appleWebApp: { capable: true, title: "Boyoma", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  openGraph: { type: "website", locale: "fr_CD", siteName: "Boyoma Connect" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F8FAFC" },
    { media: "(prefers-color-scheme: dark)", color: "#070F24" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={jakarta.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-white">
          Aller au contenu
        </a>
        {children}
        <PwaManager />
      </body>
    </html>
  );
}
