import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeSettings } from "@/components/ThemeSettings";

export const metadata: Metadata = {
  title: "S.K.Y.N.E.T.",
  description: "System for Knowledge, Yielding Neural Engagement & Tasks",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <ThemeProvider>
          {children}
          <ThemeSettings />
        </ThemeProvider>
      </body>
    </html>
  );
}
