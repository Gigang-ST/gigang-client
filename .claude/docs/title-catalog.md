# 기강 칭호 카탈로그

## 설계 원칙

- **조건 비공개**: 칭호 획득 조건은 UI에 노출하지 않음. 달성해서 알게 되는 방식.
- **획득 후 조건 표시**: 획득한 칭호는 카드 탭 시 하단 시트에서 조건 설명 확인 가능.
- **도감 방식**: 보유한 칭호는 모두 컬렉션에 마스킹 해제 상태로 남음. 상위 칭호 획득 시 하위 칭호는 선택 불가(흐릿)로 전환될 뿐 사라지지 않음.
- **카테고리 내 선택 규칙**: 러닝/트레일/철인/사이클 계열은 보유 칭호 중 최고 rarity_level 1개만 대표 칭호로 선택 가능. rarity_level로 상위/하위 판단.
- **등급(rarity_level) 비공개**: 등급은 내부 관리용 숫자(1~10). 유저에게 노출 안 함.
- **이벤트 칭호**: 특정 이벤트·시즌 참여로 자동 해금. 마스킹(???) 없음. 미보유 시 선택 불가. 전체 카운트에서 제외.
- **수여 칭호**: 단장이 직접 생성·부여. 카운트 포함. rarity_level 부여 가능. 마스킹(???) 없음 — 미보유 시 흐릿하게만 표시.
- **공식 대회 기록만 인정**: 러닝은 등록된 대회 기록 기준.
- **자동 부여/회수**: auto 칭호는 조건 충족 시 즉시 부여(트리거). 조건 미충족으로 변경되면 관리자 "전체 재계산" 시 자동 회수.

---

## 컬렉션 UI 구조

```
프로필 카드
└── [내 컬렉션] 버튼
    └── 바텀 시트
        ├── 탭: [ 칭호 ] [ 프레임 ]
        │
        ├── 칭호 탭
        │   ├── 일반  획득 12 / 24  ████████░░░░  50%
        │   ├── 칭호 그리드 (획득: 이펙트 풀, 미획득: ???  흐릿)
        │   │   └── 탭 시 하단 시트: 칭호명 + 이펙트 미리보기 + 획득 조건(획득 후만)
        │   │
        │   ├── 이벤트              ← 카운트 없음, ??? 마스킹 없음
        │   ├── 이벤트 그리드 (보유: 선택 가능, 미보유: 흐릿 — 조건명 미표시)
        │   ├── 수여  획득 3 / 6   ← 카운트 O, ??? 마스킹 없음
        │   └── 수여 그리드 (보유: 선택 가능, 미보유: 흐릿 — 조건명 미표시)
        │
        └── 프레임 탭
            ├── 획득 3 / 12  ███░░░░░░░░░  25%
            └── 프레임 그리드 (획득: 선택 가능, 미획득: 흐릿)
```

### 칭호 선택 규칙
- **자동 계열(러닝·트레일 등)**: 보유 칭호 중 같은 카테고리 내 rarity_level이 더 높은 칭호가 있으면 낮은 칭호는 선택 불가 (마스킹 해제 상태로 도감에는 남음)
- **이벤트**: 보유한 것만 선택 가능, 복수 선택 가능. 전체 카운트 미포함.
- **수여**: 보유한 것만 선택 가능, 복수 선택 가능. 카운트 포함. 마스킹 없음.
- **일반 카운트**: 이벤트 제외, 자동 계열은 카테고리별 최고 rarity 1개만 카운트

### 상위/하위 판단 기준
같은 `ttl_ctgr_cd` 안에서 `rarity_level`로 비교. 예: 러닝 카테고리에서 SUB4(6) 보유 시 초보(3), 러너(4), 마라토너(5)는 선택 불가 — 단 컬렉션에 표시는 됨(마스킹 해제).

### 그룹 코드 (ttl_group_cd)
`ttl_mst`의 정수형 컬럼. 같은 카테고리 안에서 상하위 rarity 비교 범위를 묶는 데 사용하는 범용 필드.
`null`이면 그룹 미지정. UI에 노출하지 않는 내부 관리 값이며, 관리자 페이지(`/admin/system/titles`)에서 직접 입력한다.

| ttl_group_cd | 대상 칭호 |
|-------------|----------|
| `1` | 러닝 PB 계열 9종 (뉴비 ~ SUB3) |
| `null` | 계열 비교 없이 독립 선택되는 칭호 (제네럴 전체, 러닝 완주 횟수 등) |
| 그 외 | 추후 다른 카테고리 계열 칭호에 자유 지정 |

---

## 1. 러닝 (ttl_ctgr_cd: `running`)

> 조건을 충족하는 모든 칭호가 동시에 부여됨. `ttl_group_cd`가 같은 계열 안에서 rarity_level이 더 높은 칭호가 있으면 낮은 칭호는 선택 불가(도감에는 남음).
> `ttl_group_cd = null`인 칭호(완주 계열 등)는 계열 비교 없이 독립적으로 선택 가능.
> 엔진이 "상위 조건 미충족"을 판단하지 않음 — UI에서 rarity로 처리.

### 1-1. PB 계열 (ttl_group_cd: `1`)

가입 기간 및 대회 기록 PB 기반. 빠를수록 상위 칭호.

| 칭호명 | rarity_level | 설명 | cond_rule_json |
|--------|-------------|------|---------------|
| 뉴비 | 1 | 기강에 처음 발을 들인 신규 멤버 | `{"type":"membership_days","days":0}` |
| 런린이 | 2 | 가입한지 3달차 초보 러너 | `{"type":"membership_days","days":91}` |
| 초보 | 3 | 10K를 1시간 안에 완주한 러너 | `{"type":"race_pb_under_sec","sport":"10K","sec":3600}` |
| 러너 | 4 | 하프마라톤을 2시간 안에 완주한 러너 | `{"type":"race_pb_under_sec","sport":"HALF","sec":7200}` |
| 마라토너 | 5 | 풀코스를 5시간안에 완주한 러너 | `{"type":"race_pb_under_sec","sport":"FULL","sec":18000}` |
| SUB4 | 6 | 풀코스 4시간 벽을 넘은 러너 | `{"type":"race_pb_under_sec","sport":"FULL","sec":14400}` |
| 330 | 7 | 풀코스 3시간 30분을 깬 러너 | `{"type":"race_pb_under_sec","sport":"FULL","sec":12600}` |
| 싱글 | 8 | 풀코스 3시간 10분대 진입한 러너 | `{"type":"race_pb_under_sec","sport":"FULL","sec":11400}` |
| SUB3 | 9 | 풀코스 3시간 벽을 넘은 엘리트 러너 | `{"type":"race_pb_under_sec","sport":"FULL","sec":10800}` |

### 1-2. 완주 횟수 계열 (ttl_group_cd: `null`, 독립 선택 가능)

완주 경험 누적 기반. 같은 거리 내에서도 복수 보유 가능하며 rarity 비교 없이 각각 독립 선택.

| 칭호명 | rarity_level | 설명 | cond_rule_json |
|--------|-------------|------|---------------|
| 10K | 2 | 10K 대회를 완주한 적 있는 러너 | `{"type":"race_finish_count","sport":"10K","count":1}` |
| HALF | 3 | 하프마라톤을 완주한 적 있는 러너 | `{"type":"race_finish_count","sport":"HALF","count":1}` |
| FULL | 4 | 풀코스 마라톤을 완주한 적 있는 러너 | `{"type":"race_finish_count","sport":"FULL","count":1}` |
| 단거리 | 4 | 10K를 10번 완주한 레이스 단골 | `{"type":"race_finish_count","sport":"10K","count":10}` |
| 하프중독 | 5 | 하프를 10번 완주한 하프마라톤 중독자 | `{"type":"race_finish_count","sport":"HALF","count":10}` |
| 풀마니아 | 6 | 풀코스를 10번 완주한 마라톤 마니아 | `{"type":"race_finish_count","sport":"FULL","count":10}` |

### 1-3. 랭킹 계열 (ttl_group_cd: `null`, 신규 CondRule 타입 필요)

> ⚠️ `race_rank_by_gender` (성별 종목 순위), `race_rank_last` (꼴찌), `race_pb_within_sec_of_target` (목표 기록 N초 이내 미달) CondRule 타입 추가 필요.
> 랭킹 칭호는 `manual_sweep` 시 재계산 — 기록 갱신으로 순위가 바뀌면 자동 회수/재부여.

| 칭호명 | rarity_level | 설명 | 필요 CondRule 타입 | cond_rule_json |
|--------|-------------|------|------------------|---------------|
| 기강1황 | 10 | 기강 남자 풀코스 1위 | `race_rank_by_gender` | `{"type":"race_rank_by_gender","sport":"FULL","gender":"male","rank":1}` |
| Queen | 10 | 기강 여자 풀코스 1위 | `race_rank_by_gender` | `{"type":"race_rank_by_gender","sport":"FULL","gender":"female","rank":1}` |
| 하프킹 | 8 | 기강 남자 하프 1위 | `race_rank_by_gender` | `{"type":"race_rank_by_gender","sport":"HALF","gender":"male","rank":1}` |
| 하프퀸 | 8 | 기강 여자 하프 1위 | `race_rank_by_gender` | `{"type":"race_rank_by_gender","sport":"HALF","gender":"female","rank":1}` |
| 단거리왕 | 7 | 기강 10K 1위 | `race_rank_by_gender` | `{"type":"race_rank_by_gender","sport":"10K","gender":"any","rank":1}` |
| 마지막영웅 | 3 | 풀·하프·10K 남녀 각각 꼴찌 기록 | `race_rank_last` | `{"type":"race_rank_last","sports":["FULL","HALF","10K"],"gender":"any"}` |
| 억울해? | 4 | 풀코스 PB가 SUB4/330/싱글/SUB3 목표 기록 5초 이내 미달 | `race_pb_within_sec_of_target` | `{"type":"race_pb_within_sec_of_target","sport":"FULL","targets":[14400,12600,11400,10800],"within_sec":5}` |

---

## 2. 철인3종 (ttl_ctgr_cd: `triathlon`)

| 칭호명 | rarity_level | 조건 |
|--------|-------------|------|
| (미정) | 5 | TRIATHLON_OLYMPIC 완주 |
| (미정) | 7 | TRIATHLON_HALF 완주 |
| (미정) | 9 | TRIATHLON_FULL 완주 |

---

## 3. 트레일러닝 (ttl_ctgr_cd: `trail`)

> ⚠️ **자동 부여 현재 비활성** — 트레일 대회 기록이 `rec_race_hist`에 직접 등록되지 않아 조건 평가 시 항상 0건.
> 소스 로직은 완성(evaluator의 `race_finish_count` + `sport_ctgr: "trail_run"` 필터).
> 트레일 기록을 `rec_race_hist`에 업로드하는 방법이 생기면 즉시 작동.
> 현재는 **수동 수여**로 운영.
>
> 도감 방식. 상위 rarity 보유 시 하위는 선택 불가.
> `sport_ctgr: "trail_run"` + `sport` (comp_evt_type 거리)로 로드와 구분.

| 칭호명 | rarity_level | cond_rule_json 조건 |
|--------|-------------|------|
| 동네언덕 | 3 | `race_finish_count`: sport_ctgr=trail_run 완주 1회 (거리 무관) |
| 뒷산주민 | 5 | `race_finish_count`: sport_ctgr=trail_run + sport=20K 완주 1회 |
| 새벽산꾼 | 7 | `race_finish_count`: sport_ctgr=trail_run + sport=50K 완주 1회 |
| 산악대장 | 9 | `race_finish_count`: sport_ctgr=trail_run + sport=100K 완주 1회 |
| 산신령 | 10 | `race_finish_count`: sport_ctgr=trail_run + sport=100M 완주 1회 |
| 山神 | 10 | 기강 트레일런 1위 — `race_rank_by_gender` 타입 응용 또는 `race_rank_overall` 신규 타입 필요 |

---

## 4. 사이클 (ttl_ctgr_cd: `cycling`)

> ⚠️ 백엔드 선행 필요: `MEDIOFONDO` event_type 추가

| 칭호명 | rarity_level | 조건 |
|--------|-------------|------|
| (미정) | 5 | MEDIOFONDO 완주 |
| (미정) | 7 | GRANFONDO 완주 |

---

## 5. 제네럴 (ttl_ctgr_cd: `general`)

> 종목과 무관한 가입 기간, 계절 참여, 복합 활동 기반 칭호.
> 모두 `ttl_group_cd: null` — 계열 비교 없이 각각 독립 선택 가능.

### 5-1. 가입 기간 계열

현재 엔진의 `membership_days` 조건으로 바로 구현 가능.

| 칭호명 | rarity_level | 설명 | cond_rule_json |
|--------|-------------|------|---------------|
| 1년차 | 5 | 기강에 가입한 지 1년이 된 멤버 | `{"type":"membership_days","days":365}` |
| 고인물 | 6 | 기강 가입 2년 이상의 베테랑 | `{"type":"membership_days","days":730}` |
| 화석 | 7 | 기강 가입 3년 이상, 이미 전설이 된 멤버 | `{"type":"membership_days","days":1095}` |
| 7월7일 | 4 | 7월 7일에 가입한 행운의 멤버 | `{"type":"joined_on_date","month":7,"day":7}` (신규 타입 필요) |

### 5-2. 계절 계열

> ⚠️ `race_finish_in_month_range` CondRule 타입 추가 필요.
> 사계절 칭호를 모두 보유하면 `race_finish_all_titles` 조건으로 **사계절** 칭호 추가 부여.

| 칭호명 | rarity_level | 설명 | cond_rule_json |
|--------|-------------|------|---------------|
| 봄 | 3 | 3~4월에 대회를 완주한 멤버 | `{"type":"race_finish_in_month_range","months":[3,4]}` |
| 여름 | 5 | 7~8월 뙤약볕 아래 대회를 완주한 멤버 | `{"type":"race_finish_in_month_range","months":[7,8]}` |
| 가을 | 3 | 10~11월에 대회를 완주한 멤버 | `{"type":"race_finish_in_month_range","months":[10,11]}` |
| 겨울 | 5 | 12~1월 추위를 뚫고 대회를 완주한 멤버 | `{"type":"race_finish_in_month_range","months":[12,1]}` |
| 사계절 | 6 | 봄·여름·가을·겨울 칭호를 모두 보유한 연중무휴 멤버 | `{"type":"race_finish_all_titles","ttl_nms":["봄","여름","가을","겨울"]}` |

### 5-3. 복합 조건 계열

> ⚠️ 아래 칭호는 현재 엔진에 없는 CondRule 타입을 사용함. 구현 전 `lib/titles/types.ts` + `evaluators.ts` 확장 필요.

| 칭호명 | rarity_level | 설명 | 필요 CondRule 타입 | cond_rule_json |
|--------|-------------|------|------------------|---------------|
| 멀티러너 | 4 | 10K·하프·풀을 모두 완주한 전천후 러너 | `race_finish_all_of` | `{"type":"race_finish_all_of","sports":["10K","HALF","FULL"],"count":1}` |
| 대회왕 | 6 | 종목 구분 없이 대회를 20회 이상 완주한 대회 덕후 | `race_finish_total` | `{"type":"race_finish_total","count":20}` |
| 시즌러너 | 4 | 한 해에 대회를 5회 이상 완주한 성실한 멤버 | `race_finish_in_year` | `{"type":"race_finish_in_year","count":5}` |
| 돈을 달린다 | 6 | 한 해에 대회를 10회 이상 완주한, 스포츠에 지갑을 열어둔 사람 | `race_finish_in_year` | `{"type":"race_finish_in_year","count":10}` |
| 서브현근 | 9 | 풀코스 PB < 이현근 mem_id의 풀코스 PB | `race_pb_faster_than_member` | `{"type":"race_pb_faster_than_member","sport":"FULL","target_mem_id":"이현근의_mem_id"}` |
| 전천후 | 8 | 러닝·트레일·철인·사이클 칭호를 각 1개 이상 보유한 멀티 스포츠인 | `has_title_in_categories` | `{"type":"has_title_in_categories","categories":["running","trail","triathlon","cycling"]}` |

---

## 6. 수여 칭호 (ttl_ctgr_cd: `awarded`)

> 단장이 직접 생성·부여. 카운트 포함. rarity_level 부여 가능.
> 마스킹(???) 없음 — 미보유 시 흐릿하게만 표시. 복수 선택 가능.

| 칭호명 | rarity_level | 설명 |
|--------|-------------|------|
| 맛객 | 3 | 맛집 마스터 |
| 순간포착 | 5 | 대회 현장 사진 담당 |
| (자유 생성) | — | 자유롭게 추가 |

---

## 7. 이벤트 칭호 (ttl_ctgr_cd: `event`)

> 특정 이벤트·시즌 참여로 자동 해금. rarity_level 해금과 무관.
> 전체 카운트 미포함. 마스킹(???) 없음. 미보유 시 흐릿하게만 표시, 선택 불가.
> 복수 선택 가능.

| 칭호명 | 조건 |
|--------|------|
| 기강단장 | 모임장 |
| 행동대장 | 운영진 |


---

## 구현 로드맵

| 단계 | 작업 | 상태 |
|------|------|------|
| 1 | 칭호명 확정 (단장과 논의) | 진행 중 |
| 2 | 러닝 PB 계열 9종 DB 등록 | 칭호명 확정 후 |
| 3 | 러닝 완주 횟수 계열 6종 DB 등록 | 칭호명 확정 후 |
| 3-1 | 랭킹 CondRule 타입 구현 (`race_rank_by_gender`, `race_rank_last`, `race_rank_overall`, `race_pb_within_sec_of_target`) | 개발 필요 |
| 3-2 | 러닝 랭킹 계열 7종 DB 등록 (기강1황·Queen·하프킹·하프퀸·단거리왕·마지막영웅·억울해?) | 3-1 완료 후 |
| 3-3 | 트레일 山神 DB 등록 | 3-1 완료 후 |
| 4 | 제네럴 가입 기간 계열 3종 DB 등록 (1년차·고인물·화석) | 칭호명 확정 후 |
| 5 | `joined_on_date` CondRule 타입 구현 | 개발 필요 |
| 6 | 제네럴 7월7일 DB 등록 | 5 완료 후 |
| 7 | 계절 CondRule 타입 구현 (`race_finish_in_month_range`, `race_finish_all_titles`) | 개발 필요 |
| 8 | 제네럴 계절 계열 5종 DB 등록 (봄·여름·가을·겨울·사계절) | 7 완료 후 |
| 9 | 복합 조건 CondRule 타입 구현 (`race_finish_all_of`, `race_finish_total`, `race_finish_in_year`, `race_pb_faster_than_member`, `has_title_in_categories`) | 개발 필요 |
| 10 | 제네럴 복합 조건 계열 6종 DB 등록 (멀티러너·대회왕·시즌러너·돈을달린다·서브현근·전천후) | 9 완료 후 |
| 11 | 철인3종 칭호 3종 DB 등록 | 칭호명 확정 후 |
| 12 | Event 칭호 등록 | 칭호명 확정 후 |
| 13 | 트레일 칭호 | sport 컬럼 추가 선행 필요 |
| 14 | 사이클 칭호 | MEDIOFONDO event_type 추가 선행 필요 |
| 15 | 프로필 "내 컬렉션" UI 구현 | Phase 2 |
| 16 | 칭호 선택 + 대표 설정 UI | Phase 2 |
| 17 | 카드 프레임 수집·선택 UI | Phase 2 |



### TODO
칭호관리에서 부여할수있게