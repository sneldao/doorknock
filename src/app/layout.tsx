import type { Metadata } from "next";
import "@fontsource-variable/fraunces";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Doorknock — the pre-meeting briefing agent",
  description:
    "Tell Doorknock who you're meeting and when. A research crew sweeps the last 30 days and hands you a one-page brief — every claim traced to a source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
