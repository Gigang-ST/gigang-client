import type { PbTrack } from "@/lib/pb-class-chart";
import { formatSec, type PbRule } from "@/lib/pb-class-score";

import { EmptyState } from "@/components/common/empty-state";
import { HelpTip } from "@/components/common/help-tip";
import { Caption, Micro } from "@/components/common/typography";

import { PbPaceTrackField } from "./pb-pace-track-field";
import { PbZone } from "./pb-zone";

function TrackHelp({ rule }: { rule: Pick<PbRule, "tenKFactor" | "midWkNo"> }) {
  return (
    <HelpTip title="예상기록은 이렇게 내요">
      10K 측정 기록이 있으면 그 기록, 없으면 가장 최근 5K 기록({rule.midWkNo}주차 → 1주차)에 {rule.tenKFactor}를
      곱해 10K로 바꿔요.
      <br />
      얼굴을 누르면 누군지와 예상기록이 보여요.
    </HelpTip>
  );
}

/** 범례 겸 판독값 — 트랙 위 표시(목표선·중앙값)가 무엇인지와 그 값 */
function Legend({ track }: { track: PbTrack }) {
  const num = "font-semibold tabular-nums text-foreground";
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <li>
        <Micro>
          트랙 위 <span className={num}>{track.runners.length}명</span>
        </Micro>
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-0 border-x-[5px] border-b-[6px] border-x-transparent border-b-muted-foreground"
        />
        <Micro>
          중앙값 <span className={num}>{formatSec(track.median.sec)}</span>
        </Micro>
      </li>
      {track.goal && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-0 border-l-[1.5px] border-dashed border-primary" />
          <Micro>
            내 목표 <span className={num}>{formatSec(track.goal.sec)}</span>
          </Micro>
        </li>
      )}
    </ul>
  );
}

/**
 * 10K 예상기록 현황 — 크루 전원을 한 트랙에 세운다(왼쪽 느림 → 오른쪽 빠름).
 *
 * 오너 요청(2026-10-08): 「수평선에 느린 사람 왼쪽 빠른 사람 오른쪽, 뛰는 모션, 위에 이름표 같은 느낌,
 * 손가락 올리면 그 사람 누군지」. 순위 숫자는 세우지 않는다 — 자리가 이미 말하고, 「몇 등」을 적는 순간
 * 같이 훈련하는 지면이 성적표가 된다(돌아보기 지면과 같은 태도).
 *
 * **공개 범위는 크루 출석과 같다**: 이름과 기록이 같이 실리므로 승인된 참가자에게만 그린다(점수판이 거른다).
 * 트랙 데이터(`buildPbTrack`)도 그때만 만들어 클라이언트로 보낸다 — 화면에서 숨기기만 하면 RSC 로는 실려 나간다.
 */
export function PbPaceTrack({ track, rule }: { track: PbTrack | null; rule: Pick<PbRule, "tenKFactor" | "midWkNo"> }) {
  return (
    // 리드는 360px 본문(312px)에 한 줄로 — 두 줄로 꺾이면 마지막 「요」 한 글자가 혼자 내려간다
    <PbZone label="10K Forecast" lead="10K 예상기록 — 오른쪽일수록 빨라요" action={<TrackHelp rule={rule} />}>
      {track ? (
        <>
          <Legend track={track} />
          <PbPaceTrackField track={track} />
          {track.missingCnt > 0 && (
            <Caption className="break-keep">
              기록을 올리면 트랙에 서요 · {track.meMissing ? `나 포함 ${track.missingCnt}명` : `${track.missingCnt}명`}
            </Caption>
          )}
        </>
      ) : (
        <EmptyState variant="card" message="5K 기록이 올라오면 트랙에 서요" />
      )}
    </PbZone>
  );
}
