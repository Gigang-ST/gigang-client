import type { Metadata } from "next";

import { ABOUT_META } from "@/lib/about/content";

import "./about.css";

export const metadata: Metadata = {
  title: ABOUT_META.title,
  description: ABOUT_META.description,
  openGraph: {
    title: ABOUT_META.title,
    description: ABOUT_META.description,
    images: ["/logo-mark.png"],
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
