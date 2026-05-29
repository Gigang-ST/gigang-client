# 칭호 & 이펙트 등급 시스템 (v2)

## 개요

- 등급은 **1~10** 숫자로 관리. 10이 가장 희귀.
- 유저에게 등급 숫자/이름 노출 없음 — 내부 관리 전용.
- 유저는 **본인 보유 칭호 중 최고 등급 이하**의 이펙트/프레임을 자유롭게 선택.
- 칭호마다 이펙트를 고정하지 않음 → 관리자는 등급만 설정.

---

## 등급별 해금 구조

```
유저 최고 칭호 등급 = 6
→ 배지 이펙트 등급 1~6 전부 선택 가능
→ 카드 프레임 등급 1~6 전부 선택 가능
→ 등급 7 이상은 🔒 잠김
```

---

## 배지 이펙트 등급 배정

| 등급 | 배지 이펙트 | 특징 |
|------|------------|------|
| 1 | `none` `dim` | 움직임 없음, 무채색 |
| 2 | `breathe` `italic-drift` `dot-blink` `glow-soft` | 아주 미세한 움직임 |
| 3 | `soft-shine` `silver` `underline-fade` | 은은한 shimmer, 은색 |
| 4 | `bronze` `neon` `flare` | 색감 등장, 약한 발광 |
| 5 | `gold` `ice` `emerald` `sapphire` | 보석/금속 shimmer |
| 6 | `hologram` `fire` `pulse-color` `void-text` | 다색 그라디언트 |
| 7 | `rainbow` `plasma` `lava` `crimson` | 강한 색감 + 발광 |
| 8 | `matrix` `glitch` `wave` `zoom` `bounce` `shake` `flip` | 움직임 계열 |
| 9 | `bounce-rainbow` `bounce-ice` `shake-fire` `wave-hologram` `flip-gold` | 움직임 + 그라디언트 조합 |
| 10 | `shake-lava` `zoom-plasma` `zoom-rainbow` `wave-fire` `typewriter` `spark` | 최상위 복합 이펙트 |

---

## 카드 프레임 등급 배정

| 등급 | 카드 프레임 | 특징 |
|------|------------|------|
| 1 | `none` | 기본 |
| 2 | `subtle` `soft-white` | 아주 미세한 테두리 변화 |
| 3 | `silver` `bronze` | 은·구릿빛 테두리 |
| 4 | `neon` `emerald` `sapphire` | 컬러 테두리 발광 |
| 5 | `ice` `gold` `dusk` | 보석/금속 발광 |
| 6 | `aurora` `shimmer` `void` | 다색 글로우 / 대각선 shimmer |
| 7 | `crimson` `obsidian` `fire` | 강한 발광 |
| 8 | `lightning` `heartbeat` `scan` `glitch` | 움직임 있는 프레임 |
| 9 | `rainbow` `plasma` | 회전 그라디언트 테두리 |
| 10 | (추후 전용 이펙트 추가 예정) | 최상위 전용 |

---

## 칭호 등급 → 이펙트 해금 예시

| 칭호 | 등급 | 해금 이펙트 범위 |
|------|------|----------------|
| 뉴비 | 1 | 배지 1등급, 프레임 1등급 |
| 입문 | 2 | 배지 1~2등급, 프레임 1~2등급 |
| 초보 | 3 | 배지 1~3등급, 프레임 1~3등급 |
| 러너 | 4 | 배지 1~4등급, 프레임 1~4등급 |
| 마라토너 | 5 | 배지 1~5등급, 프레임 1~5등급 |
| SUB4 | 6 | 배지 1~6등급, 프레임 1~6등급 |
| 330 | 7 | 배지 1~7등급, 프레임 1~7등급 |
| 싱글 | 8 | 배지 1~8등급, 프레임 1~8등급 |
| SUB3 | 9 | 배지 1~9등급, 프레임 1~9등급 |
| (추후 최상위) | 10 | 배지 1~10등급, 프레임 1~10등급 |

---

## DB 구조 변경

### ttl_mst 변경
```sql
-- effect_cd 제거, rarity_level(1~10) 추가
ALTER TABLE public.ttl_mst
  DROP COLUMN effect_cd,
  ADD COLUMN rarity_level smallint NOT NULL DEFAULT 1
    CHECK (rarity_level BETWEEN 1 AND 10);
```

### 이펙트 마스터 테이블 (신규)
```sql
CREATE TABLE public.effect_mst (
  effect_cd   text PRIMARY KEY,           -- 'neon', 'gold', ...
  effect_nm   text NOT NULL,              -- 표시명
  effect_type text NOT NULL,              -- 'badge' | 'frame'
  rarity_level smallint NOT NULL          -- 1~10
    CHECK (rarity_level BETWEEN 1 AND 10),
  sort_ord    integer NOT NULL DEFAULT 0
);
```

### 유저 선택 저장
```sql
-- team_mem_rel에 선택 컬럼 추가
ALTER TABLE public.team_mem_rel
  ADD COLUMN selected_badge_effect text,  -- 선택한 배지 이펙트
  ADD COLUMN selected_frame_cd     text;  -- 선택한 카드 프레임
```

### 해금 로직 (서버에서 검증)
```
유저 최고 rarity_level = MAX(보유 칭호의 rarity_level)
선택 가능 조건: effect_mst.rarity_level <= 유저 최고 rarity_level
```

---

## 기존 설계 대비 장점

| 항목 | 기존 | 변경 후 |
|------|------|---------|
| 칭호 생성 시 | 이펙트까지 고려해야 함 | 등급 숫자만 입력 |
| 이펙트 추가 시 | 칭호별 재배정 필요 | effect_mst에 추가만 하면 됨 |
| 유저 경험 | 칭호 = 이펙트 고정 | 등급 내에서 자유롭게 커스터마이징 |
| 확장성 | 칭호·이펙트 강결합 | 완전 독립적으로 확장 가능 |

---

## 구현 순서

| 단계 | 작업 |
|------|------|
| 1 | `ttl_mst.effect_cd` → `rarity_level` 마이그레이션 |
| 2 | `effect_mst` 테이블 생성 + 전체 이펙트 데이터 입력 |
| 3 | `team_mem_rel`에 `selected_badge_effect`, `selected_frame_cd` 추가 |
| 4 | 관리 UI: 칭호 생성 폼에서 이펙트 선택 → 등급 선택으로 변경 |
| 5 | 컬렉션 UI: 이펙트 선택 화면 (해금된 것만 표시) |
| 6 | 랭킹/홈/프로필에서 `selected_badge_effect`, `selected_frame_cd` 읽어서 렌더링 |
