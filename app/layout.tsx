import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Panel",
  description: "Manage systemd services",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  );
}
