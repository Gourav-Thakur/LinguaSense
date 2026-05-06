import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Chameleon Stealth Protocol — Crisis Intervention Dashboard",
  description: "Operator dashboard for the 1092 Chameleon AI dispatcher.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
