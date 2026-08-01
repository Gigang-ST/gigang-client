/**
 * 앱 셸 폭 — 데스크톱에서만 고르는 "넓게 보기".
 *
 * 이 앱의 화면은 375px 기준이라 기본은 폰 폭(`--app-max-w`)으로 묶여 있고(§DESIGN 앱 셸),
 * 지면이 남는 데스크톱에서만 사용자가 몇 단계 넓힐 수 있다. 셸·탭바·FAB이 전부
 * `--app-max-w` 하나를 보고 있어 이 변수만 갈아끼우면 셋이 함께 따라온다.
 *
 * ⚠️ 값과 계산식은 여기가 정본이다 — 첫 페인트 전 인라인 스크립트(`shellWidthBootScript`)와
 * 마운트 후 클라이언트 컴포넌트가 **같은 규칙**으로 움직여야 한다. 한쪽만 고치면
 * 새로고침 때 폭이 한 번 튀거나(스크립트가 옛 규칙) 컨트롤이 실제와 다른 값을 켠 채로 남는다.
 */

/** 고를 수 있는 폭 — 첫 값이 기본이자 하한이다. */
export const APP_WIDTHS = [480, 640, 800] as const;

export type AppWidth = (typeof APP_WIDTHS)[number];

export const APP_WIDTH_DEFAULT: AppWidth = APP_WIDTHS[0];

export const APP_WIDTH_KEY = "gigang:app-width";

/** 폭을 고쳤다고 알리는 window 이벤트 — 컨트롤이 자기 상태를 DOM에서 다시 읽는 신호. */
export const APP_WIDTH_EVENT = "gigang:app-width-change";

/**
 * 셸을 좁혀 보이려면 양옆에 이만큼은 남아야 한다.
 *
 * 이 폭이 안 되면 회색 지면도 컨트롤도 켜지 않는다 — 10px짜리 회색 실선은
 * 지면을 가르는 게 아니라 그냥 얼룩으로 보인다.
 */
const GUTTER_MIN = 96;

/**
 * 넓힌 셸이 남겨야 하는 최소 여백.
 *
 * ⚠️ 이게 없으면 **되돌릴 수 없는 상태**가 생긴다: 900px 창에서 800을 고른 뒤 창을 850으로
 * 줄이면 셸이 화면을 거의 꽉 채워 컨트롤이 설 자리가 사라진다. 그래서 화면이 좁아지면
 * 저장값은 그대로 두고 **보이는 폭만** 깎는다(다시 넓히면 원래 고른 값으로 돌아온다).
 */
const CONTROL_ROOM = 120;

export type ShellWidthState = {
  /** 실제로 `--app-max-w`에 넣을 값 */
  width: number;
  /** 셸 양옆에 지면이 보이는가 — 회색 배경·그림자·폭 컨트롤의 켜짐 조건 */
  inset: boolean;
};

/** 저장된 선호 폭 + 현재 뷰포트 → 실제 적용값. 인라인 스크립트와 같은 식이어야 한다. */
export function resolveShellWidth(pref: number, viewport: number): ShellWidthState {
  const inset = viewport >= APP_WIDTH_DEFAULT + GUTTER_MIN;
  const width = inset
    ? Math.max(APP_WIDTH_DEFAULT, Math.min(pref, viewport - CONTROL_ROOM))
    : pref;
  return { width, inset };
}

/** 저장값 읽기 — 못 읽거나 목록에 없는 값이면 기본으로. */
export function readStoredWidth(): AppWidth {
  try {
    const raw = Number(window.localStorage.getItem(APP_WIDTH_KEY));
    return (APP_WIDTHS as readonly number[]).includes(raw)
      ? (raw as AppWidth)
      : APP_WIDTH_DEFAULT;
  } catch {
    return APP_WIDTH_DEFAULT;
  }
}

/**
 * 첫 페인트 전에 실행되는 인라인 스크립트.
 *
 * ⚠️ 이게 없으면 새로고침마다 480으로 그렸다가 넓어지는 **점프**가 보인다
 * (next-themes가 테마에 쓰는 것과 같은 이유·같은 자리). 상수는 위에서 주입하므로
 * 값을 바꿔도 여기 문자열은 손대지 않는다.
 */
export const shellWidthBootScript = `(function(){try{
var d=document.documentElement,v=window.innerWidth,B=${APP_WIDTH_DEFAULT},G=${GUTTER_MIN},R=${CONTROL_ROOM};
var p=Number(localStorage.getItem(${JSON.stringify(APP_WIDTH_KEY)}))||B;
var i=v>=B+G,w=i?Math.max(B,Math.min(p,v-R)):p;
d.style.setProperty('--app-max-w',w+'px');
if(i)d.setAttribute('data-shell-inset','');
}catch(e){}})();`;
