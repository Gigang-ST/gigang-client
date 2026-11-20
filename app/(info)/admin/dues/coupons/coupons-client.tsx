"use client";

import { useMemo, useState, useTransition } from "react";

import { toast } from "sonner";

import { cancelCoupon, issueCoupons, unredeemCoupon, redeemCoupon } from "@/app/actions/coupon/manage-coupons";
import { COUPON_STATUS_LABEL, COUPON_TYPE_LABEL, type CouponStatus } from "@/lib/coupon/status";
import type { CouponView } from "@/lib/coupon/core";
import { duplicateNames, memberLabel } from "@/lib/dues/homonyms";
import type { MemberOption } from "@/lib/queries/dues";
import { COUPON_TYPES, type CouponType } from "@/lib/validations/coupon";

import { MemberCombobox } from "@/app/(info)/admin/dues/inbox/member-combobox";

import { SegmentControl } from "@/components/common/segment-control";
import { Body, Caption } from "@/components/common/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Filter = "all" | CouponStatus;

export function CouponsClient({ coupons, members }: { coupons: CouponView[]; members: MemberOption[] }) {
  const dupNames = useMemo(() => duplicateNames(members.map((m) => ({ name: m.name }))), [members]);
  const nameOf = useMemo(() => {
    const map = new Map(members.map((m) => [m.memId, memberLabel({ name: m.name, birthDt: m.birthDt }, dupNames)]));
    return (id: string) => map.get(id) ?? "(알 수 없음)";
  }, [members, dupNames]);

  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? coupons : coupons.filter((c) => c.status === filter);

  return (
    <div className="flex flex-col gap-4 px-6 pb-6 pt-2">
      <IssueForm members={members} dupNames={dupNames} />
      <SegmentControl
        segments={[
          { value: "all", label: `전체 ${coupons.length}` },
          { value: "active", label: COUPON_STATUS_LABEL.active },
          { value: "used", label: COUPON_STATUS_LABEL.used },
          { value: "expired", label: COUPON_STATUS_LABEL.expired },
        ]}
        value={filter}
        onValueChange={(v) => setFilter(v as Filter)}
      />
      {shown.length === 0 ? (
        <Caption>해당하는 쿠폰이 없어요.</Caption>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => (
            <CouponRow key={c.cpn_id} coupon={c} memberName={nameOf(c.mem_id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueForm({ members, dupNames }: { members: MemberOption[]; dupNames: Set<string> }) {
  const [isPending, startTransition] = useTransition();
  const [memId, setMemId] = useState<string | null>(null);
  const [tp, setTp] = useState<CouponType>("SINGLET");
  const [txt, setTxt] = useState("");
  const [amt, setAmt] = useState("");
  const [expDt, setExpDt] = useState("");

  function submit() {
    if (!memId) {
      toast.error("회원을 골라 주세요.");
      return;
    }
    startTransition(async () => {
      const res = await issueCoupons([
        {
          memId,
          cpnTpCd: tp,
          cpnTxt: txt,
          cpnAmt: amt.trim() ? Number(amt) : null,
          expDt: expDt || null,
        },
      ]);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("발급했어요.");
      setTxt("");
      setAmt("");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <Body className="font-semibold">쿠폰 발급</Body>
      <div className="flex flex-col gap-1.5">
        <Label>회원</Label>
        <MemberCombobox members={members} value={memId} dupNames={dupNames} onSelect={setMemId} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>종류</Label>
        <Select value={tp} onValueChange={(v) => setTp(v as CouponType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUPON_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {COUPON_TYPE_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>쿠폰 내용</Label>
        <Input value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={200} placeholder="예: 싱글렛 1만원 할인 / 대회 참가비 50% 지원" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>금액(원, 선택)</Label>
          <Input inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} placeholder="비워도 돼요" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>유효기간(선택)</Label>
          <Input type="date" value={expDt} onChange={(e) => setExpDt(e.target.value)} />
        </div>
      </div>
      <Button onClick={submit} disabled={isPending}>
        발급
      </Button>
    </div>
  );
}

function CouponRow({ coupon: c, memberName }: { coupon: CouponView; memberName: string }) {
  const [isPending, startTransition] = useTransition();
  const [memo, setMemo] = useState("");
  const [using, setUsing] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.message ?? "처리하지 못했어요.");
        return;
      }
      toast.success(done);
      setUsing(false);
    });
  }

  return (
    <li className="flex flex-col gap-1 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <Body className="font-semibold">{memberName}</Body>
        <Caption>{COUPON_STATUS_LABEL[c.status]}</Caption>
      </div>
      <Caption className="text-foreground">
        {c.type_label} · {c.cpn_txt}
        {c.cpn_amt != null ? ` · ${c.cpn_amt.toLocaleString()}원` : ""}
      </Caption>
      <Caption>{c.exp_dt ? `${c.exp_dt}까지` : "기한 없음"}</Caption>
      {c.used_yn ? (
        <Caption>
          {c.used_dt} 사용{c.used_memo_txt ? ` · ${c.used_memo_txt}` : ""}
        </Caption>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {c.used_yn ? (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => run(() => unredeemCoupon(c.cpn_id), "사용 처리를 되돌렸어요.")}>
            사용 되돌리기
          </Button>
        ) : (
          <>
            {c.status === "active" && !using ? (
              <Button size="sm" variant="outline" onClick={() => setUsing(true)}>
                사용 처리
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                if (window.confirm("이 쿠폰 발급을 취소할까요? 회원 화면에서도 사라져요.")) {
                  run(() => cancelCoupon(c.cpn_id), "발급을 취소했어요.");
                }
              }}
            >
              발급 취소
            </Button>
          </>
        )}
      </div>
      {using ? (
        <div className="mt-2 flex gap-2">
          <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} placeholder="사용 메모(어디에 썼는지)" />
          <Button size="sm" disabled={isPending} onClick={() => run(() => redeemCoupon({ cpnId: c.cpn_id, memo }), "사용 처리했어요.")}>
            확인
          </Button>
        </div>
      ) : null}
    </li>
  );
}
