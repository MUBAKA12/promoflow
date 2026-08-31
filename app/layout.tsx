import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PromoFlow",
  description: "Content engine for TikTok Shop affiliates",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
