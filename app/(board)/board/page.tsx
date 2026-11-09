import type { Metadata } from "next";
import { TEAM_ID_BY_CD } from "@/lib/constants/gigang-team";
import { getCachedBoardPosts } from "@/lib/queries/board";
import { BackHeader } from "@/components/back-header";
import { BoardClient } from "./board-client";

export const metadata: Metadata = {
  title: "게시판",
  description: "기강 러닝크루 공지사항과 업데이트 소식.",
  alternates: { canonical: "/board" },
};

// 게시판은 공개 정적 페이지(SSG). 로그인·팀 컨텍스트에 의존하지 않는다.
// TODO(멀티팀): 아직 기강으로 고정이다 — 울산 주소에서도 기강 공지가 나온다. 접속 팀 기준으로
// 바꾸는 건 정적 생성(함수 호출 0)을 유지할 방법과 함께 따로 정리한다.
const TEAM_ID = TEAM_ID_BY_CD.gigang;

export default async function BoardPage() {
  const [notices, updates] = await Promise.all([
    getCachedBoardPosts(TEAM_ID, "notice"),
    getCachedBoardPosts(TEAM_ID, "update"),
  ]);

  return (
    <div className="flex flex-col">
      <BackHeader title="게시판" fallbackHref="/" />
      <BoardClient initialNotices={notices} initialUpdates={updates} />
    </div>
  );
}
