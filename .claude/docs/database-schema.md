# 데이터베이스 스키마 가이드

## Supabase 프로젝트
- MCP 서버로 연결됨 (`.mcp.json` 참조)
- 직접 SQL 쿼리 대신 Supabase JS 클라이언트 사용

## 테이블 구조

### member (회원)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | Supabase auth.users.id와 연동 |
| full_name | text | 실명 |
| gender | text | 성별 (남/여) |
| birthday | date | 생년월일 |
| phone | text | 전화번호 |
| email | text | 이메일 |
| bank_name | text | 은행명 |
| bank_account | text | 계좌번호 |
| status | text | 상태 (active/inactive/pending) |
| kakao_user_id | text | 카카오 연동 ID |
| google_user_id | text | 구글 연동 ID |
| joined_at | timestamp | 가입일 |
| admin | boolean | 관리자 여부 |

### competition (대회)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | 대회 ID |
| external_id | text | 외부 시스템 ID |
| sport | text | 종목 (road_run, ultra, trail_run, triathlon, cycling) |
| title | text | 대회명 |
| start_date | date | 시작일 |
| end_date | date | 종료일 |
| location | text | 장소 |
| event_types | text[] | 세부 종목 배열 |
| source_url | text | 대회 정보 URL |

### competition_registration (대회 참가 등록)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | 등록 ID |
| competition_id | uuid (FK) | → competition.id |
| member_id | uuid (FK) | → member.id |
| role | text | 역할 (participant/cheering/volunteer) |
| event_type | text | 참가 세부종목 (participant일 때만) |
| created_at | timestamp | 등록일시 |

### race_result (대회 기록)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid (PK) | 기록 ID |
| member_id | uuid (FK) | → member.id |
| event_type | text | 종목 (FULL/HALF/10K 등) |
| record_time_sec | integer | 총 기록 (초 단위) |
| race_name | text | 대회명 |
| race_date | date | 대회 날짜 |
| swim_time_sec | integer (nullable) | 수영 기록 (초, 철인3종용) |
| bike_time_sec | integer (nullable) | 바이크 기록 (초, 철인3종용) |
| run_time_sec | integer (nullable) | 런 기록 (초, 철인3종용) |

**RLS 정책**: INSERT/UPDATE/DELETE는 member 테이블 조인으로 인증 (`member.kakao_user_id = auth.uid()` 또는 `member.google_user_id = auth.uid()`)

### personal_best (개인최고기록) — 레거시
> **참고**: records/rankings 페이지와 프로필 개인최고기록은 모두 `race_result` 테이블에서 조회.
> `personal_best` 테이블은 더 이상 사용되지 않음.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| member_id | uuid (FK) | → member.id |
| event_type | text | 종목 (FULL/HALF/10K/5K 등) |
| record_time_sec | integer | 기록 (초 단위) |
| race_name | text | 대회명 |
| race_date | date | 대회 날짜 |
| updated_at | timestamp | 수정일시 |

### utmb_profile (UTMB 프로필)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| member_id | uuid (FK) | → member.id |
| utmb_index | integer | UTMB 인덱스 점수 |
| utmb_profile_url | text | UTMB 프로필 링크 |

## 종목 카테고리

### Road Running
3K, 5K, 10K, HALF, FULL

### Ultramarathon
50K, 80K, 100K, 100M

### Trail Running
20K, 50K, 100K, 100M, UTMB

### Triathlon
SPRINT, OLYMPIC, HALF, FULL

### Cycling
GRANFONDO, ROAD RACE, TIME TRIAL, CRITERIUM

## 쿼리 패턴 예시

```typescript
// 서버 컴포넌트에서 회원 정보 조회
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
const { data: member } = await supabase
  .from("member")
  .select("*")
  .eq("id", user.id)
  .single();

// 대회 목록 + 등록자 수
const { data: competitions } = await supabase
  .from("competition")
  .select("*, competition_registration(count)")
  .gte("start_date", today)
  .order("start_date");

// 랭킹 조회 (race_result에서 멤버별 최고기록 추출)
const { data: raceData } = await supabase
  .from("race_result")
  .select("event_type, record_time_sec, race_name, member:member_id(id, full_name, gender)");
// 클라이언트에서 멤버별 종목별 최저 record_time_sec을 추출하여 랭킹 구성
```
