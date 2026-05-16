import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeBootstrap } from "@/components/ThemeToggle";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thistlewood & Associates",
  description: "Double-entry accounting for a small professional services firm.",
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning on <html> is required because <ThemeBootstrap />
    // runs an inline script that sets data-theme on <html> before React
    // hydrates. Without this, the server-rendered <html> (no attribute) and
    // the client (with data-theme="dark") differ → React error #418 +
    // cascading "parentNode of null" errors. Standard pattern from the
    // next-themes / system-preference theme docs.
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <ThemeBootstrap />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
