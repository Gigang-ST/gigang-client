"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createProject } from "@/app/actions/dues/manage-projects";
import type { ProjectSummary } from "@/lib/queries/dues";

import { EmptyState } from "@/components/common/empty-state";
import { Body, Caption, H2, Micro } from "@/components/common/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardItem } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 프로젝트(모금) 목록 화면. 생성 다이얼로그 + 프로젝트별 모금액·건수 요약.
 * 상태 변경·명단은 상세 화면에서 한다.
 */
export function ProjectsClient({ projects }: { projects: ProjectSummary[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onCreate() {
    setErr(null);
    startTransition(async () => {
      const res = await createProject({ name, memo: memo || null });
      if (res.ok) {
        setOpen(false);
        setName("");
        setMemo("");
        router.refresh();
      } else {
        setErr(res.message);
      }
    });
  }

  const active = projects.filter((p) => p.stCd === "active");
  const closed = projects.filter((p) => p.stCd === "closed");

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-4">
      <div className="flex items-center justify-between">
        <H2>프로젝트 모금</H2>
        <Button size="sm" onClick={() => setOpen(true)}>
          새 프로젝트
        </Button>
      </div>
      <Caption>
        단체복·야유회 같은 프로젝트성 입금을 모아 봅니다. 거래내역 처리에서 분류를
        &lsquo;프로젝트&rsquo;로 하고 여기 만든 프로젝트에 귀속시키면 명단·모금액이 집계됩니다.
      </Caption>

      {projects.length === 0 ? (
        <EmptyState variant="card" message="아직 프로젝트가 없습니다. 첫 프로젝트를 만들어 보세요." />
      ) : (
        <>
          {[
            { label: "모금 중", rows: active },
            { label: "마감", rows: closed },
          ].map(
            (g) =>
              g.rows.length > 0 && (
                <div key={g.label} className="flex flex-col gap-2">
                  <Caption className="font-semibold text-foreground">{g.label}</Caption>
                  <CardItem className="flex flex-col divide-y divide-border p-0 overflow-hidden">
                    {g.rows.map((p) => (
                      <Link
                        key={p.prjId}
                        href={`/admin/dues/projects/${p.prjId}`}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <Body className="truncate font-semibold">{p.name}</Body>
                            {p.stCd === "closed" && (
                              <Badge className="border-0 bg-muted text-muted-foreground">마감</Badge>
                            )}
                          </div>
                          <Micro>
                            {p.txnCount}건{p.memo ? ` · ${p.memo}` : ""}
                          </Micro>
                        </div>
                        <Body className="shrink-0 font-semibold">{p.totalAmt.toLocaleString()}원</Body>
                      </Link>
                    ))}
                  </CardItem>
                </div>
              ),
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>새 프로젝트</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prj-name">이름</Label>
              <Input
                id="prj-name"
                placeholder="단체복 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="prj-memo">메모 (선택)</Label>
              <Input id="prj-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
            </div>
            {err && <Caption className="text-destructive">{err}</Caption>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button type="button" disabled={pending || !name.trim()} onClick={onCreate}>
              {pending ? "생성 중…" : "만들기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
