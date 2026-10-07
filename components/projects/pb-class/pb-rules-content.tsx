import type { PbClassCfg } from "@/lib/pb-class";
import { Caption } from "@/components/common/typography";
import { formatWon } from "./format";

/**
 * 겨울 10K PB 클래스 규칙 — 숫자는 전부 관리자 설정값(cfg)에서 뽑는다.
 *
 * 규칙 정본은 #577이지만 화면에 숫자를 박아 두면 관리자가 설정을 바꾸는 순간 안내가
 * 거짓말이 된다. 미신청 카드와 신청 후 규칙 시트가 **같은 목록**을 쓰도록 한 곳에 둔다.
 */
export function PbRulesContent({ cfg }: { cfg: PbClassCfg }) {
  const total = cfg.depositAmt + cfg.entryFeeAmt;
  const rules = [
    `참가비는 ${formatWon(total)}이에요. 보증금 ${formatWon(cfg.depositAmt)}과 참가비 ${formatWon(cfg.entryFeeAmt)}으로 나뉘어요.`,
    "공식훈련 벙에 참석해야 출석으로 인정돼요.",
    `측정일 포함 ${cfg.totSessCnt}회 중 ${cfg.fullRfndAttdCnt}회 출석하면 보증금을 전액 돌려받아요. 덜 나오면 출석한 만큼 비례해서 돌려받아요.`,
    "한파로 못 한 회차는 모두 불참으로 처리돼요. 기준 회차는 그대로예요.",
    "돌려주지 않는 보증금은 회식비와 대회 참가비로 써요.",
    `W${cfg.lateJoinWkNo}부터 합류하면 보증금 없이 참가비만 내요. 환급·팀전 대상은 아니에요.`,
  ];

  return (
    <ul className="flex flex-col gap-2">
      {rules.map((text) => (
        <li key={text} className="flex gap-2">
          <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
          <Caption className="leading-relaxed text-foreground">{text}</Caption>
        </li>
      ))}
    </ul>
  );
}
