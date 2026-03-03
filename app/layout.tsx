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
  openGraph: {
    title: siteContent.metadata.title,
    description: siteContent.metadata.description,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: siteContent.metadata.title,
    description: siteContent.metadata.description,
    images: ["/og-image.png"],
  },
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
