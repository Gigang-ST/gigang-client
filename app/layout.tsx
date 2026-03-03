import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/app-shell";
import { siteContent } from "@/config";

const SITE_URL = "https://gigang-client-theta.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: siteContent.metadata.title,
  description: siteContent.metadata.description,
  openGraph: {
    title: siteContent.metadata.title,
    description: siteContent.metadata.description,
    siteName: siteContent.brand.fullName,
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteContent.metadata.title,
    description: siteContent.metadata.description,
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
