"use client";

import Image from "next/image";
import { useState } from "react";

import type { StoryPost } from "@/lib/queries/story-posts";

import { MemberCardDialogDynamic as MemberCardDialog } from "@/components/members/member-card-dialog-dynamic";
import { RecordReelViewer } from "@/components/story/record-reel-viewer";
import type { TeamCopy } from "@/lib/team-copy";

/** 릴스 뷰어가 댓글·프로필 카드에 쓰는 「보는 사람」 정보 */
export type PbTeamPhotosViewer = {
  teamId: string;
  memId: string;
  memNm: string | null;
  avatarUrl: string | null;
  /** 팀 문구 — 릴스 뷰어·프로필 카드에 넘긴다(§lib/team-copy) */
  copy: TeamCopy;
};

/**
 * 팀 카드 아래 사진 줄 — 동계 훈련 기간에 팀원들이 깅스타그램에 올린 최근 사진(#621 아이디어 9).
 *
 * 누르면 깅스타그램과 **같은 릴스 뷰어**로 연다(따로 만들면 댓글·신고·⚡ 배지가 한쪽만 고쳐진다).
 * 삭제·수정 진입은 걸지 않는다 — 여긴 남의 사진을 훑는 자리고, 고치는 자리는 기강이야기 격자 하나다.
 * 사진만 담는다(격자와 같은 규칙 — 한마디·거리는 릴스가 맡는다). 사진 없는 글은 조회 단계에서 빠진다.
 */
export function PbTeamPhotos({
  grpNm,
  posts,
  viewer,
}: {
  grpNm: string;
  posts: StoryPost[];
  viewer: PbTeamPhotosViewer;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [member, setMember] = useState<{ memId: string; name: string } | null>(null);

  return (
    <>
      <ul aria-label={`${grpNm} 팀원 사진`} className="grid grid-cols-4 gap-0.5 pt-1">
        {posts.map((p) => (
          <li key={p.post_id}>
            <button
              type="button"
              onClick={() => setOpenId(p.post_id)}
              aria-label={`${p.mem_nm}의 사진 자세히 보기`}
              className="relative block aspect-square w-full overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
            >
              {p.photo_url && (
                <Image
                  src={p.photo_url}
                  alt={`${p.mem_nm} 님의 기록 사진`}
                  width={160}
                  height={160}
                  className="size-full object-cover"
                  referrerPolicy="no-referrer"
                  // 이미지 최적화는 Vercel 계량 항목이다 — 깅스타그램 격자와 같이 원본을 그대로 쓴다
                  unoptimized
                />
              )}
            </button>
          </li>
        ))}
      </ul>

      <RecordReelViewer
        posts={posts}
        startId={openId}
        open={openId !== null}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
        onSelectMember={(memId, name) => setMember({ memId, name })}
        teamId={viewer.teamId}
        myMemId={viewer.memId}
        myName={viewer.memNm}
        myAvatarUrl={viewer.avatarUrl}
        copy={viewer.copy}
      />

      <MemberCardDialog
        memId={member?.memId ?? null}
        memNm={member?.name}
        teamId={viewer.teamId}
        open={member !== null}
        onOpenChange={(o) => {
          if (!o) setMember(null);
        }}
        stacked
        copy={viewer.copy}
      />
    </>
  );
}
