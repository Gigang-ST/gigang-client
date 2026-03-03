import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { siteContent } from "@/config";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: siteContent.metadata.title,
  description: siteContent.metadata.description,
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.className} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
