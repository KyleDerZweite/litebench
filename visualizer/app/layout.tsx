import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import SiteHeader from "./site-header";

export const metadata: Metadata = {
  title: "LiteBench · Kyle's personal writing bench",
  description:
    "Read prompts, compare unedited AI answers, and inspect a draft personal writing rubric. Demo results while Kyle develops LiteBench.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <footer className="site-footer">
          <span>Kyle's personal benchmarks · demo data</span>
          <a href="https://github.com/KyleDerZweite/litebench/blob/main/THIRD_PARTY_NOTICES.md">
            Source and credits ↗
          </a>
        </footer>
      </body>
    </html>
  );
}
