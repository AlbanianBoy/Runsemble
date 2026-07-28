import type { Metadata, Viewport } from "next";
import { Manrope, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { RunSyncRegister } from "@/components/run-sync-register";
import { ErrorBoundary } from "@/components/error-boundary";

// Manrope over the stock Geist: a refined geometric-humanist sans that reads
// premium and distinctive rather than default-template. Variable, so every
// weight the UI uses ships from one file. The CSS var name stays --font-geist-sans
// so the @theme mapping and every downstream reference keep working untouched.
const sans = Manrope({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Mono stays for the instrument-panel stats (pace, distance, time) — a clean
// monospace with tabular figures is exactly right for numbers that update live.
const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Runsemble — Because together is better",
  description:
    "Social fitness platform - find runners near you and never run alone again",
  icons: {
    icon: "/logo.svg",
  },
  manifest: "/manifest.webmanifest",
};

// viewportFit: "cover" lets the app draw edge-to-edge on phones (required for
// the safe-area insets the header/nav use); themeColor tints the browser
// chrome to match the app instead of default white/black.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1613" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sans.variable} ${mono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          <ErrorBoundary>{children}</ErrorBoundary>
          <RunSyncRegister />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
