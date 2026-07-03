"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setProjectStatus } from "@/app/actions/dues/manage-projects";

import { Button } from "@/components/ui/button";

/** 프로젝트 모금 상태 토글 — 마감하면 인박스 귀속 선택지에서 빠진다(기존 귀속은 유지). */
export function ProjectStatusButton({ prjId, stCd }: { prjId: string; stCd: "active" | "closed" }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const next = stCd === "active" ? "closed" : "active";

  function onToggle() {
    const q =
      next === "closed"
        ? "모금을 마감할까요? 거래 처리의 프로젝트 선택지에서 빠집니다(이미 귀속된 거래는 유지)."
        : "모금을 다시 열까요?";
    if (!confirm(q)) return;
    startTransition(async () => {
      const res = await setProjectStatus(prjId, next);
      if (!res.ok) alert(res.message);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={onToggle}>
      {pending ? "변경 중…" : next === "closed" ? "모금 마감" : "다시 열기"}
    </Button>
  );
}
