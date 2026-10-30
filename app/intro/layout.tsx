import type { Metadata } from "next";
import { Russo_One } from "next/font/google";

import "./intro.css";

/** 인트로 제호용 — 라틴만 로드한다. 한글은 Pretendard로 떨어진다. */
const russo = Russo_One({
  variable: "--font-russo",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "기강 — No time to be weak",
  description:
    "달리기에서 시작해 트레일, 철인3종, 사이클까지. 서울에서 함께 훈련하고 함께 대회에 서는 스포츠 팀 기강.",
  openGraph: {
    title: "기강 — No time to be weak",
    description: "달리기에서 시작해 트레일, 철인3종, 사이클까지. 서울 기반 스포츠 팀.",
    images: ["/logo-mark.png"],
  },
};

/**
 * 한 화면짜리 인트로. 루트 레이아웃(앱 셸·프로바이더)은 그대로 타고, 이 안에서만
 * 제호 서체와 활자 규칙을 덧씌운다. 화면 크기는 h-svh로 잡혀 있어 스크롤이 없다.
 */
export default function IntroLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${russo.variable} intro-scope bg-intro-paper text-intro-ink`}>
      {children}
    </div>
  );
}
