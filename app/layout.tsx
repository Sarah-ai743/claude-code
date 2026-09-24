import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadPilot AI — Your 24/7 Multilingual AI Lead-Conversion Team",
  description:
    "LeadPilot AI responds to leads, qualifies prospects, and follows up automatically — in any language, around the clock.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
