/**
 * 지면 톤(테마) 정의 — `/dev/story-styles` 전용.
 *
 * **구조는 전부 같다.** 어느 존이 어떤 순서로 서는지는 `StoryPreview` 한 곳이 정하고,
 * 테마는 여기서 "어떻게 보이는가"만 바꾼다(폰트·괘선·색·숫자 스케일·리드 판형).
 * 그래야 9종을 같은 지면으로 나란히 놓고 톤만 비교할 수 있다.
 *
 * 이 파일은 프로덕션에서 쓰지 않는다. 톤이 정해지면 폴더째 지운다.
 */

/** 리드(1면 대표 기사) 판형 — 테마 성격이 가장 크게 갈리는 자리라 몇 가지 변형을 둔다 */
export type LedeVariant =
  | "editorial" // 명조 헤드라인 + 우측 기록
  | "tabloid" // 반전 블록 + 초대형 헤드라인
  | "magazine" // 거대 숫자가 주인공, 헤드라인은 부제
  | "board" // 야간 전광판 격자
  | "minimal" // 라운드 카드
  | "stat" // 숫자가 헤드라인보다 큰 비즈니스위크 식
  | "brand"; // 넓은 여백 + 큰 이미지 자리

export type SkinConfig = {
  key: string;
  name: string;
  desc: string;
  /** 항상 야간(테마 전환에 반응하지 않음) — UI에 경고를 띄운다 */
  fixedDark?: boolean;

  /** 지면 전체 래퍼 — 배경·기본 자간 */
  frameClass: string;
  /**
   * 지면 위에 덮는 질감 레이어(선택).
   * `.halftone`은 자체 `opacity`를 갖고 있어 컨테이너에 직접 걸면 본문까지 흐려진다 —
   * 그래서 별도 오버레이 div로 깐다(`.newsprint`는 ::before를 쓰므로 frameClass로 충분).
   */
  overlayClass?: string;
  /** 제호(신문 이름) */
  mastheadClass: string;
  /** 제호 아래 발행정보 */
  datelineClass: string;
  /** 제호 아래 굵은 괘선 */
  mastheadRuleClass: string;

  /** 섹션 영문 라벨 */
  sectionLabelClass: string;
  /** 섹션 라벨 아래 괘선 */
  sectionRuleClass: string;
  /** 섹션 한국어 리드문 */
  sectionLeadClass: string;

  /** 리스트 한 줄 */
  rowClass: string;
  /** 행 좌측(이름·제목) */
  rowLeadClass: string;
  /** 행 우측(수치) */
  rowTrailClass: string;

  /** 큰 수치(기록·활동량 등) */
  figureClass: string;
  /** 강조색(D-day·분위기 등) */
  accentClass: string;
  /** 헤드라인 */
  headlineClass: string;

  ledeVariant: LedeVariant;
};

/** 모든 스킨이 공유하는 기본값 — 각 스킨은 달라지는 것만 덮어쓴다 */
const BASE: Omit<SkinConfig, "key" | "name" | "desc" | "ledeVariant"> = {
  frameClass: "newsprint bg-background text-foreground",
  mastheadClass:
    "text-center font-serif text-[30px] leading-none tracking-[0.02em] text-foreground",
  datelineClass:
    "mt-2.5 text-center font-numeric text-[10px] uppercase tracking-[0.16em] text-muted-foreground",
  mastheadRuleClass: "mt-3 border-t-[3px] border-foreground",
  sectionLabelClass:
    "font-numeric text-[11px] font-medium uppercase tracking-[0.2em] text-foreground",
  sectionRuleClass: "border-b border-foreground/70 pb-2",
  sectionLeadClass: "pt-2.5 font-serif text-[15px] leading-snug text-muted-foreground",
  rowClass: "flex items-center gap-3 border-b border-border py-2.5",
  rowLeadClass: "min-w-0 flex-1 truncate text-[14px] text-foreground",
  rowTrailClass:
    "shrink-0 font-numeric text-[14px] font-medium text-foreground tabular-nums",
  figureClass: "font-numeric text-[26px] font-medium text-foreground tabular-nums",
  accentClass: "text-foreground",
  headlineClass: "font-serif text-[22px] leading-tight text-foreground",
};

export const SKINS: SkinConfig[] = [
  {
    ...BASE,
    key: "editorial",
    name: "A. 에디토리얼",
    desc: "명조 헤드라인 + 괘선. 현재 적용된 스타일 (The Athletic 계열)",
    ledeVariant: "editorial",
  },
  {
    ...BASE,
    key: "tabloid",
    name: "B. 타블로이드",
    desc: "굵은 제호, 반전 블록, 큰 숫자. 스포츠 신문 1면. 임팩트 최대",
    frameClass: "bg-background text-foreground",
    mastheadClass:
      "text-center text-[34px] font-extrabold uppercase leading-none tracking-[-0.02em] text-foreground",
    mastheadRuleClass: "mt-3 border-t-[6px] border-foreground",
    // 반전 블록 — 라벨을 검정 바탕에 흰 글씨로
    sectionLabelClass:
      "inline-block bg-foreground px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-background",
    sectionRuleClass: "border-b-[3px] border-foreground pb-2",
    sectionLeadClass: "pt-2.5 text-[15px] font-semibold leading-snug text-foreground",
    rowClass: "flex items-center gap-3 border-b-2 border-foreground/15 py-3",
    rowLeadClass: "min-w-0 flex-1 truncate text-[15px] font-bold text-foreground",
    rowTrailClass:
      "shrink-0 font-numeric text-[18px] font-extrabold text-foreground tabular-nums",
    figureClass:
      "font-numeric text-[40px] font-extrabold leading-none text-foreground tabular-nums",
    headlineClass:
      "text-[30px] font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-foreground",
    ledeVariant: "tabloid",
  },
  {
    ...BASE,
    key: "magazine",
    name: "C. 매거진",
    desc: "거대 숫자 주도, 색 블록, 막대 그래프. Strava 연말결산 계열",
    // 신문 질감 없음 — 매거진·앱 톤은 종이결이 오히려 방해된다
    frameClass: "bg-background text-foreground",
    mastheadClass:
      "text-center text-[26px] font-bold lowercase tracking-[-0.01em] text-foreground",
    mastheadRuleClass: "mt-3 border-t border-border",
    sectionLabelClass:
      "font-numeric text-[10px] font-bold uppercase tracking-[0.28em] text-primary",
    sectionRuleClass: "pb-2",
    rowClass: "flex items-center gap-3 py-2",
    rowTrailClass:
      "shrink-0 font-numeric text-[22px] font-bold text-primary tabular-nums",
    figureClass:
      "font-numeric text-[56px] font-bold leading-[0.9] text-primary tabular-nums",
    accentClass: "text-primary",
    headlineClass: "text-[19px] font-semibold leading-snug text-foreground",
    ledeVariant: "magazine",
  },
  {
    ...BASE,
    key: "board",
    name: "D. 야간 전광판",
    desc: "경기장 LED 보드. 항상 야간 + 앰버 수치 (이전 시안)",
    fixedDark: true,
    frameClass: "bg-board text-board-foreground",
    mastheadClass:
      "text-center font-numeric text-[24px] font-medium uppercase tracking-[0.3em] text-board-amber",
    datelineClass:
      "mt-2.5 text-center font-numeric text-[10px] uppercase tracking-[0.2em] text-board-muted",
    mastheadRuleClass: "mt-3 border-t border-board-line",
    sectionLabelClass:
      "font-numeric text-[10px] font-medium uppercase tracking-[0.3em] text-board-muted",
    sectionRuleClass: "border-b border-board-line pb-2",
    sectionLeadClass: "pt-2.5 text-[13px] leading-snug text-board-muted",
    rowClass: "flex items-center gap-3 border-b border-board-line py-2.5",
    rowLeadClass: "min-w-0 flex-1 truncate text-[14px] text-board-foreground",
    rowTrailClass:
      "shrink-0 font-numeric text-[16px] font-medium text-board-amber tabular-nums",
    figureClass:
      "font-numeric text-[34px] font-medium text-board-amber tabular-nums",
    accentClass: "text-board-amber",
    headlineClass:
      "font-numeric text-[20px] font-medium uppercase tracking-[0.08em] text-board-foreground",
    ledeVariant: "board",
  },
  {
    ...BASE,
    key: "minimal",
    name: "E. 미니멀 카드",
    desc: "라운드 카드 + 산세리프. 앱 나머지 페이지와 가장 잘 붙는다",
    frameClass: "bg-background text-foreground",
    mastheadClass: "text-center text-[24px] font-bold tracking-tight text-foreground",
    mastheadRuleClass: "mt-3 border-t border-border",
    sectionLabelClass:
      "text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
    sectionRuleClass: "pb-2",
    sectionLeadClass: "pt-1.5 text-[13px] leading-snug text-muted-foreground",
    rowClass:
      "flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3",
    rowLeadClass: "min-w-0 flex-1 truncate text-[14px] font-medium text-foreground",
    figureClass: "font-numeric text-[24px] font-semibold text-foreground tabular-nums",
    headlineClass: "text-[18px] font-semibold leading-snug text-foreground",
    ledeVariant: "minimal",
  },
  {
    ...BASE,
    key: "businessweek",
    name: "F. 비즈니스위크",
    desc: "숫자가 헤드라인보다 크다. 색 최소, 선 굵기 3종으로만 위계 (Bloomberg 계열)",
    mastheadClass:
      "text-center text-[28px] font-black uppercase leading-none tracking-[-0.03em] text-foreground",
    mastheadRuleClass: "mt-3 border-t-[5px] border-foreground",
    sectionLabelClass:
      "text-[10px] font-black uppercase tracking-[0.2em] text-foreground",
    sectionRuleClass: "border-b-2 border-foreground pb-1.5",
    sectionLeadClass: "pt-2 text-[13px] leading-snug text-muted-foreground",
    rowClass: "flex items-baseline gap-3 border-b border-foreground/20 py-2.5",
    rowLeadClass: "min-w-0 flex-1 truncate text-[13px] text-foreground",
    rowTrailClass:
      "shrink-0 font-numeric text-[26px] font-black leading-none text-foreground tabular-nums",
    figureClass:
      "font-numeric text-[64px] font-black leading-[0.85] text-foreground tabular-nums",
    headlineClass: "text-[15px] font-semibold leading-snug text-muted-foreground",
    ledeVariant: "stat",
  },
  {
    ...BASE,
    key: "brand",
    name: "G. 러닝 브랜드",
    desc: "넓은 여백 + 큰 사진 자리 + 넓은 자간. 프리미엄 스포츠 브랜드 톤",
    frameClass: "bg-background text-foreground",
    mastheadClass:
      "text-center text-[18px] font-semibold uppercase tracking-[0.5em] text-foreground",
    datelineClass:
      "mt-3 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground",
    mastheadRuleClass: "mt-5 border-t border-border",
    sectionLabelClass:
      "text-[10px] font-semibold uppercase tracking-[0.4em] text-muted-foreground",
    sectionRuleClass: "pb-3",
    sectionLeadClass: "pt-3 text-[14px] leading-relaxed text-muted-foreground",
    rowClass: "flex items-center gap-4 border-b border-border/60 py-4",
    rowLeadClass:
      "min-w-0 flex-1 truncate text-[14px] tracking-wide text-foreground",
    figureClass:
      "font-numeric text-[30px] font-light tracking-tight text-foreground tabular-nums",
    headlineClass:
      "text-[24px] font-light leading-tight tracking-tight text-foreground",
    ledeVariant: "brand",
  },
  {
    ...BASE,
    key: "halftone",
    name: "H. 인쇄 망점",
    desc: "halftone 텍스처로 진짜 인쇄물 질감. 사진 제판 + 2단 조판 (CSS만, 이미지 0바이트)",
    frameClass: "bg-background text-foreground",
    overlayClass: "halftone",
    mastheadClass:
      "text-center font-serif text-[32px] leading-none tracking-[0.01em] text-foreground",
    mastheadRuleClass: "mt-3 border-t-[3px] border-double border-foreground",
    sectionRuleClass: "border-b border-dashed border-foreground/60 pb-2",
    rowClass: "flex items-center gap-3 border-b border-dashed border-border py-2.5",
    figureClass:
      "font-serif text-[28px] font-medium text-foreground tabular-nums",
    headlineClass: "font-serif text-[23px] leading-tight text-foreground",
    ledeVariant: "editorial",
  },
  {
    ...BASE,
    key: "speed",
    name: "I. 스피드",
    desc: "숫자를 기울여 속도감. 스포츠 타이포 문법 + 다크 기준",
    fixedDark: true,
    frameClass: "bg-board text-board-foreground",
    mastheadClass:
      "text-center text-[30px] font-black italic uppercase leading-none tracking-[-0.03em] text-board-foreground",
    datelineClass:
      "mt-2.5 text-center font-numeric text-[10px] uppercase tracking-[0.2em] text-board-muted",
    mastheadRuleClass: "mt-3 border-t-[4px] border-board-amber",
    sectionLabelClass:
      "text-[10px] font-black italic uppercase tracking-[0.18em] text-board-amber",
    sectionRuleClass: "border-b border-board-line pb-2",
    sectionLeadClass: "pt-2.5 text-[13px] italic leading-snug text-board-muted",
    rowClass: "flex items-center gap-3 border-b border-board-line py-2.5",
    rowLeadClass:
      "min-w-0 flex-1 truncate text-[14px] font-semibold text-board-foreground",
    rowTrailClass:
      "shrink-0 font-numeric text-[20px] font-black italic text-board-amber tabular-nums",
    figureClass:
      "font-numeric text-[44px] font-black italic leading-none text-board-amber tabular-nums",
    accentClass: "text-board-amber",
    headlineClass:
      "text-[26px] font-black italic uppercase leading-[0.95] text-board-foreground",
    ledeVariant: "stat",
  },
];
