import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Realtime PDF",
  description: "Select a PDF and auto-reload it when the file changes on disk.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

