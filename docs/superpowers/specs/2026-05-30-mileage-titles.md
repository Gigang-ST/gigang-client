# 마일리지런 칭호 기획

> 2026-05-30 | feat/title-management-update 브랜치

## 개요

마일리지런 이벤트 참여 및 활동 기록을 기반으로 하는 칭호 계열.
기존 칭호(대회 기록 기반)와 소스가 달라 별도 카테고리(`mileage`)로 운영.

2026년 마일리지런(시즌4): **5월 ~ 9월 (5개월)** 운영.

---

## 설계 원칙

- 회수 없음. 한 번 부여되면 영구 보유.
- 중복 부여 없음. 이미 보유 중이면 평가 자체 스킵.
- 전 칭호 독립 선택 가능 (계열 간 rarity 비교 없음, `ttl_group_cd: null`).
- 조건 비공개 — 달성해서 알게 되는 방식.

---

## 트리거 방식

| 방식 | 대상 칭호 | 시점 |
|------|----------|------|
| 즉시 평가 | 시작이반·목표달성·막판스퍼트·올라운더·마지막불꽃 | 기록 입력 또는 참가 신청 직후 해당 멤버만 평가 |
| 월초 배치 | 내돈내놔·보증금증발·ATM·러닝원툴·수달·두바퀴인생·흙이좋아 | 매월 1일 자정 KST, 전월 마감 후 전체 참여자 평가 |

---

## 칭호 목록

### 1. 시작이반 (rarity: 2)

**조건**: 마일리지런 이벤트에 참가 신청 완료

- cond_rule: `{"type":"mileage_joined"}`
- 트리거: 즉시 (참가 신청 시)
- 비고: 가장 기본 칭호. 참가만 해도 부여.

---

### 2. 목표달성 (rarity: 4)

**조건**: 마일리지런 참여 기간 중 월 목표를 1번이라도 달성

- cond_rule: `{"type":"mileage_goal_achieved_months","count":1}`
- 트리거: 즉시 (기록 입력 시 당월 `achv_yn` 체크)
- 비고: 달성 횟수 무관, 1회 달성이면 부여.

---

### 3. 내돈내놔 (rarity: 7)

**조건**: 마일리지런 5개월 전 기간 월 목표 달성 (누적 5개월)

- cond_rule: `{"type":"mileage_goal_achieved_months","count":5}`
- 트리거: 월초 배치 (매월 1일, `evt_mlg_mth_snap.achv_yn` 누적 체크)
- 비고: 어차피 5개월이 전체 기간 = 전 기간 완주.

---

### 4. 막판스퍼트 (rarity: 4)

**조건**: 해당 월의 마지막 날 기록을 입력해서 월 목표를 달성

- cond_rule: `{"type":"mileage_goal_achieved_on_last_day"}`
- 트리거: 즉시 (기록의 `act_dt`가 해당 월의 마지막 날 + 그 기록 입력으로 처음 `achv_yn`이 true가 되는 경우)
- 비고: 입력 날짜(오늘)가 아니라 운동한 날짜(`act_dt`) 기준. 6월 1일에 5월 31일 기록을 입력해도 대상. 이미 달성 상태(`achv_yn=true`)라면 해당 없음.

---

### 5. 올라운더 (rarity: 5)

**조건**: 한 달 안에 러닝·트레일·자전거·수영 4종목 모두 1회 이상 기록

- cond_rule: `{"type":"mileage_all_sports_in_month","sports":["RUNNING","TRAIL","CYCLING","SWIMMING"]}`
- 트리거: 즉시 (기록 입력 시 당월 `sprt_enm` 종류 집계)
- 비고: 목표 달성 여부 무관. 종목만 충족하면 부여.

---

### 6. 보증금증발 (rarity: 2)

**조건**: 마일리지런에서 월 목표를 달성하지 못한 달이 1번이라도 있음

- cond_rule: `{"type":"mileage_goal_failed_months","count":1}`
- 트리거: 월초 배치 (매월 1일, 전월 `achv_yn = false` 체크)
- 비고: 회수 없음. 이후에 달성해도 칭호 유지.

---

### 7. ATM (rarity: 3)

**조건**: 마일리지런 목표 달성 실패 누적 3개월 이상 (연속 아님, 누적)

- cond_rule: `{"type":"mileage_goal_failed_months","count":3}`
- 트리거: 월초 배치 (누적 실패 월 수 체크)
- 비고: 회수 없음. 실패 3회 누적 시점에 부여.

---

### 8. 마지막불꽃 (rarity: 6)

**조건**: 이벤트 마지막달 또는 마지막 전달 중 하나라도 월 목표 대비 120% 이상 달성

- cond_rule: `{"type":"mileage_rocket_in_months","position":["last","second_last"],"threshold":1.2}`
- 트리거: 즉시 (기록 입력 시 현재 월이 last/second_last인지 + `achv_mlg / goal_mlg >= 1.2` 체크)
- 비고: `evt_team_mst.end_dt` 기준으로 last/second_last 동적 계산. 둘 중 하나만 달성해도 부여.

---

### 9. 러닝원툴 (rarity: 4)

**조건**: 한 달 목표를 러닝 기록만으로 달성 (트레일·자전거·수영 기록이 해당 월에 없음)

- cond_rule: `{"type":"mileage_goal_achieved_by_single_sport","sport":"RUNNING"}`
- 트리거: 즉시 (기록 입력 시 당월 달성 + RUNNING 외 종목 기록 수 = 0 동시 체크)
- 비고: 달성 시점 기준. 다른 종목 기록이 0이어야 함.

---

### 10. 수달 (rarity: 4)

**조건**: 한 달 마일리지의 50% 이상을 수영으로 달성

- cond_rule: `{"type":"mileage_sport_ratio","sport":"SWIMMING","min_ratio":0.5}`
- 트리거: 즉시 (기록 입력 시 당월 종목별 `SUM(final_mlg)` 비율 계산)
- 비고: 목표 달성 여부 무관.

---

### 11. 두바퀴인생 (rarity: 4)

**조건**: 한 달 마일리지의 50% 이상을 자전거로 달성

- cond_rule: `{"type":"mileage_sport_ratio","sport":"CYCLING","min_ratio":0.5}`
- 트리거: 즉시 (기록 입력 시 당월 종목별 `SUM(final_mlg)` 비율 계산)
- 비고: 목표 달성 여부 무관.

---

### 12. 흙이좋아 (rarity: 4)

**조건**: 한 달 마일리지의 50% 이상을 트레일러닝으로 달성

- cond_rule: `{"type":"mileage_sport_ratio","sport":"TRAIL","min_ratio":0.5}`
- 트리거: 즉시 (기록 입력 시 당월 종목별 `SUM(final_mlg)` 비율 계산)
- 비고: 목표 달성 여부 무관.

---

## 개발 선행 사항

1. `lib/titles/types.ts` — CondRule 유니온에 마일리지런 타입 8종 추가 + `TRIGGER_COND_MAP`에 `mileage_run` 트리거 조건 확장
2. `lib/titles/evaluators.ts` — 즉시 평가용 evaluator 9종 구현 (`evaluateCondition` switch 케이스 추가)
3. `app/actions/mileage-run.ts` — `logActivity`, `joinProject` 액션 끝에 칭호 평가 트리거 추가
4. 월초 배치 — `app/actions/admin/batch-mileage-titles.ts` 서버 액션 작성 + pg_cron 또는 Supabase Edge Function으로 매월 1일 자정 KST 실행
5. DB INSERT — 개발계·운영계 `ttl_mst`에 12종 칭호 데이터 등록
