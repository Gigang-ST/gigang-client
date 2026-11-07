import { dayjs } from "@/lib/dayjs";
import { ToolInputError } from "@/lib/mcp/queries";

/**
 * 운영 MCP 쓰기 도구가 공유하는 **KST 벽시계 일시** 파서.
 * `create_gathering`(#485)에서 처음 만들었고 `create_sch_post`(#630)가 같은 약속을 따른다 —
 * 도구마다 따로 들면 한쪽만 고쳐져 같은 입력이 도구에 따라 다르게 저장된다.
 */

/**
 * 도구가 받는 일시 형식. **KST 벽시계 시각**만 받는다.
 *
 * `Z`·`+09:00` 같은 오프셋 표기를 섞어 받으면 `dayjs.tz(x, "Asia/Seoul")` 가 그 값을 다시
 * KST 로 해석해 9시간이 조용히 밀린다 — 일정이 엉뚱한 시각에 서는데 아무 에러도 안 난다.
 * 형식을 하나로 좁혀 그 경로 자체를 없앤다(앱 폼도 `YYYY-MM-DDTHH:mm` 을 넘긴다).
 */
const KST_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

/**
 * KST 벽시계 문자열 → UTC ISO. 형식 위반은 안전 에러로 되돌린다(9시간 밀림 방지).
 *
 * **`isValid()` 로는 부족하다**(2026-08-21 E2E 에서 실제로 통과했다): dayjs 는 범위를 벗어난
 * 값을 거부하지 않고 **굴린다**. `2026-13-05` → `2027-01-05`, `2026-02-31` → `2026-03-03`,
 * `25:99` → 다음 날 `02:39`. 전부 `isValid() === true` 라, 월을 잘못 적은 일정이 **에러 하나
 * 없이 딴 달에 선다** — 오프셋 표기를 막아 놓고 정작 같은 결과를 다른 문으로 들여보내는 꼴이다.
 *
 * 그래서 파싱 결과를 **되찍어 입력과 대조**한다. 굴러간 값은 원문과 달라지므로 여기서 걸린다.
 *
 * @param label   에러 메시지에 쓸 필드 이름(예: `시작 일시(stt_at)`)
 * @param localDt KST 벽시계 문자열(`YYYY-MM-DD HH:mm`, `T` 구분자·초 표기 허용)
 * @throws ToolInputError 형식 위반·존재하지 않는 일시
 */
export function toUtcIsoKst(label: string, localDt: string): string {
  const raw = localDt.trim();
  if (!KST_DATETIME_RE.test(raw)) {
    throw new ToolInputError(
      `${label} 은 KST 기준 'YYYY-MM-DD HH:mm' 형식이어야 합니다(시간대 표기 없이). 받은 값: ${localDt}`,
    );
  }
  const normalized = raw.replace(" ", "T");
  const parsed = dayjs.tz(normalized, "Asia/Seoul");
  if (!parsed.isValid()) {
    throw new ToolInputError(`${label} 이 실제 존재하는 일시가 아닙니다. 받은 값: ${localDt}`);
  }
  // 초 표기가 있으면 초까지, 없으면 분까지 되찍어 원문과 맞대본다.
  const fmt = normalized.length > 16 ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DDTHH:mm";
  if (parsed.format(fmt) !== normalized) {
    throw new ToolInputError(
      `${label} 이 실제 존재하는 일시가 아닙니다(${parsed.format("YYYY-MM-DD HH:mm")} 으로 해석됨). 받은 값: ${localDt}`,
    );
  }
  return parsed.toISOString();
}

/** UTC ISO → 사람이 확인하기 좋은 KST 표기. */
export function toKstLabel(iso: string | null): string | null {
  return iso ? dayjs(iso).tz("Asia/Seoul").format("YYYY-MM-DD(ddd) HH:mm") : null;
}
