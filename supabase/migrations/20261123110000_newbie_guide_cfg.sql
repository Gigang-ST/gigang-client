-- 신입 안내(/newbie) 「이런 활동을 해요」 칩·「더 알아보기」 칸을 팀 설정으로(#748 · #650 참고, 2026-11-23).
-- 키 정의는 `lib/team-cfg/registry.ts`(newbie.activities · newbie.sections), 형식은 `lib/newbie-guide.ts`.
--
-- 예전엔 기강 운영 안내가 화면 코드(`app/newbie/newbie-content.tsx`)에 박혀 기강에서만 섰다. 이 파일은 **기강의 그 문구를 그대로**
-- 마크다운으로 옮겨 넣는다(울산·다른 팀은 넣지 않는다 — 비어 있으면 두 영역 다 안 보인다. 운영진이 「팀 설정」에서 쓴다).
-- 본문은 테스트 고정 자료(`lib/__fixtures__/gigang-newbie-guide.ts`)와 같아야 한다 — 회귀 테스트가 이 파일을 읽어 대조한다.
--
-- ⚠️ **배포 전 필수.** 새 코드는 하드코딩을 걷고 이 설정만 읽으므로, 행 없이 배포되면 기강 신입 안내에서 칩과 「더 알아보기」가 사라진다.
-- 이미 살아 있는 행이 있으면(운영진이 먼저 고쳤으면) 건드리지 않는다. 지워진(del_yn) 정본 행만 남아 있으면 이 값으로 되살린다 —
-- 예전 조건(NOT EXISTS)은 지워진 행도 「있음」으로 보고 넘어가, 기강 신입 안내가 빈 채로 남을 수 있었다(PR #745 리뷰).

SET lock_timeout = '3s';

INSERT INTO public.team_cfg (team_id, cfg_cd, cfg_val_json)
SELECT t.team_id, v.cfg_cd, v.val
FROM public.team_mst t
JOIN (
  VALUES
    ('newbie.activities', $activities$["🏃 러닝", "🚴 자전거", "🏊 수영", "⛰️ 등산", "🏅 대회", "🎉 외 활동 다수"]$activities$::jsonb),
    ('newbie.sections', $sections$[
  {
    "title": "신입회원 안내말씀",
    "icon": "notice",
    "body": "### 정기 러닝\n- 격주 수요일 저녁 7:30 PM\n- 장소: 양재천·한강·여의도·남산 일대 (사전 공지)\n- 카카오톡에서 공지 확인\n\n### 요청사항\n- 카카오톡 오픈채팅 참여 필수\n- 정기 러닝 참석 시 카톡에 미리 표시\n- 모임 후 뒷정리 참여해 주세요.\n\n문의: IG @leegun_indie_pnk / 카카오톡 winsu",
    "visible": true
  },
  {
    "title": "회칙",
    "icon": "rules",
    "body": "- **자유 모임 개설** — 누구나 자유롭게 모임을 만들 수 있습니다.\n- **나이 제한** — 86년생부터 가입 가능\n- **카톡 참석 표시** — 정기 러닝 참석 시 카카오톡에 미리 표시\n- **Sport Team 활동** — 팀 활동에 적극 참여해 주세요.\n- **회비** — 월 2,000원\n- **기타** — 지각 시 스쿼트 등 재밌는 벌칙이 있어요 😄",
    "visible": true
  },
  {
    "title": "모임 안전수칙",
    "icon": "safety",
    "body": "- **보행자 조심** — 좁은 길에서는 한 줄로 달리기\n- **선두 수신호** — 선두가 방향 전환/정지 신호, 후미가 복명복창\n- **그룹 규모** — 최대 6명 그룹으로 나눠 달리기\n- **초보자 질주 금지** — 무리한 페이스는 부상의 원인!\n- **필수 준비물** — 일정에 따라 꼭 챙겨주세요.\n  자전거 → 헬멧\n  야간 등산 → 랜턴, 등산화 등",
    "visible": true
  },
  {
    "title": "러닝팁 (등급·페이스·러닝화)",
    "icon": "tip",
    "body": "### 등급표\n| 등급 | 기준 |\n| --- | --- |\n| 런린이 | 5km 러닝 불가 |\n| 입문 | 5km 30분 내 러닝 가능 |\n| 초보 | 대회 참여 경험자부터 |\n| 중수 | 꾸준히 대회 참여 & 기록 단축 중 |\n| 고수 | 실력자! |\n| 최고존엄 | 넘사벽 |\n\n### 러닝의 종류\n- **조깅** — 대화 가능한 편한 페이스 (회복/워밍업)\n- **LSD (Long Slow Distance)** — 천천히 오래 달리기 (지구력 향상)\n- **인터벌** — 빠르게/천천히 반복 (스피드 향상)\n- **지속주 (템포런)** — 일정 페이스 유지 (젖산역치 향상)\n\n### 심박수 & 페이스\n심박수는 운동 강도의 지표입니다.\n최대 심박수의 60~70% → 유산소 구간\n최대 심박수의 80% 이상 → 무산소 구간\n\n페이스(min/km)는 1km를 달리는 데 걸리는 시간입니다.\n\n### 난이도 설정 방법\n대화가 가능하면 → **Easy**\n문장이 끊기면 → **Moderate**\n단어만 나오면 → **Hard**\n\n초보자는 Easy 70% + Moderate 30%로 시작하세요.\n\n### 러닝화\n입문자에게는 쿠셔닝이 충분한 데일리 러닝화를 추천합니다.\n나이키 페가수스, 아식스 노바블라스트, 호카 클리프톤 등이 대표적이에요.\n\n자세한 건 모임에서 알려드릴게요! 👟",
    "visible": true
  }
]$sections$::jsonb)
) AS v(cfg_cd, val) ON t.team_cd = 'gigang'
ON CONFLICT (team_id, cfg_cd, vers) DO UPDATE
  SET cfg_val_json = EXCLUDED.cfg_val_json, del_yn = false, upd_at = now()
  WHERE team_cfg.del_yn;
