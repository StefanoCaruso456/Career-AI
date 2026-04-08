import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/app-providers";
import { FloatingSiteHeader } from "@/components/floating-site-header";
import "./globals.css";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

const displayFont = Sora({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Career AI",
  description:
    "Career AI delivers AI-native identity and verification infrastructure for hiring, with recruiter-safe trust views and evidence-backed candidate records.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <AppProviders>
          <FloatingSiteHeader />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
