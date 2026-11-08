# 기강 운영 MCP — 연결·사용 가이드

운영진이 **자기 AI 비서(Claude Code / Cursor / Claude Desktop)**에 붙여, 기강 운영 현황을 조회하고 알림을 보내는 MCP 서버입니다. 설치 파일을 "다운로드"하는 게 아니라, **엔드포인트 URL + 개인 토큰**을 AI 클라이언트에 등록하면 됩니다.

- 설계 정본: [`docs/superpowers/specs/2026-07-24-gigang-ops-mcp-design.md`](../../../docs/superpowers/specs/2026-07-24-gigang-ops-mcp-design.md)
- 전송 방식: Streamable HTTP (`mcp-handler`)

---

## 1. 접속 정보

| 환경 | 엔드포인트 URL | 토큰 발급 화면 |
|------|----------------|----------------|
| 로컬 | `http://localhost:3000/api/mcp/mcp` | `http://localhost:3000/mcp-tokens` |
| 개발(dev) | `https://dev.gigang.team/api/mcp/mcp` | `https://dev.gigang.team/mcp-tokens` |
| 운영(prod) | `https://gigang.team/api/mcp/mcp` | `https://gigang.team/mcp-tokens` |

> 라우트가 `app/api/mcp/[transport]/route.ts`라 basePath가 `/api/mcp`이고, 접속 URL은 끝에 `/mcp`가 한 번 더 붙어 **`/api/mcp/mcp`**입니다.

각 환경은 자기 Supabase를 쓰므로, 그 환경에 **마이그레이션 2건이 적용돼 있어야** 동작합니다(§5 참고).

---

## 2. 개인 토큰 발급

1. 위 표의 **토큰 발급 화면**(`/mcp-tokens`)에 로그인 상태로 접속. (설정 화면의 "MCP 토큰" 링크로도 이동 가능)
2. 라벨 입력(예: `내 노트북`) → **발급**.
3. `gmcp_...` 토큰이 **딱 한 번만** 표시됩니다. 즉시 복사하세요 — 다시 볼 수 없습니다.
4. 안 쓰는 토큰은 같은 화면에서 **폐기**할 수 있습니다. 폐기 즉시 접속이 차단됩니다.

- 토큰은 **본인 것만** 보이고 폐기할 수 있습니다.
- 조회는 대체로 팀 멤버면 누구나. **알림 발송(`send_push`)·단톡방 공지(`send_kakao_notice`)·멤버 참석 현황(`list_members_attendance`)은 owner/admin 역할만** 됩니다(§4 권한 경계).

---

## 3. AI 클라이언트에 등록

> ⚠️ 토큰은 **비밀**입니다. git에 커밋되는 공용 파일(`.mcp.json` 등)에 넣지 말고, 사용자 스코프나 git 미추적 위치에 두세요.

### Claude Code (CLI)
```bash
claude mcp add --transport http --scope user gigang-ops \
  https://dev.gigang.team/api/mcp/mcp \
  --header "Authorization: Bearer gmcp_여기에붙여넣기"
```
- 등록 후 **새 세션**을 시작하고 `/mcp`에서 `gigang-ops ✔ Connected` 확인 → `whoami`로 신원 확인.
- `--scope user`: 모든 프로젝트에서 사용. 특정 프로젝트만이면 생략.

### Cursor — `.cursor/mcp.json`
```json
{
  "mcpServers": {
    "gigang-ops": {
      "url": "https://dev.gigang.team/api/mcp/mcp",
      "headers": { "Authorization": "Bearer gmcp_여기에붙여넣기" }
    }
  }
}
```

### Claude Desktop
설정 → Connectors에 원격 MCP로 같은 URL + `Authorization` 헤더 추가. (HTTP+헤더 인증 미지원 구버전은 `mcp-remote` 브릿지 사용.)

---

## 4. 사용 예시 · 도구 목록

AI에게 자연어로 물으면 아래 도구를 알아서 호출합니다. **"누구를 부를지" 같은 판단은 AI가** 하고, 도구는 사실만 돌려줍니다.

| 도구 | 입력 | 하는 일 | 권한 |
|------|------|---------|------|
| `whoami` | — | 내 신원(mem_id·team·admin 여부) 확인 | 멤버 |
| `list_today_gatherings` | `date?`(YYYY-MM-DD, 기본 오늘) | 오늘(또는 지정일) 모임 + **모임 설명(난이도)** + 각 참석자 수 | 멤버 |
| `list_recent_members` | `limit?`(기본 10) | 최근 가입 멤버 + **러닝 프로필(가까운 역·평균 거리·페이스·가입 목적)** | 멤버 |
| `list_members_attendance` | `limit?` | 멤버별 참석 횟수·마지막 참석일(오래 안 나온 순) | **admin** |
| `get_member_profile` | `member_id`(uuid) 또는 `name` | 멤버 프로필(이름·가입일·역할·소개·아바타 + **생일·성별은 admin 만**) + **러닝 프로필(가까운 역·평균 거리·페이스·가입 목적)** | 멤버 |
| `list_gathering_non_attendees` | `gathering_id`(uuid) | 특정 모임 미참석자 명단 (+ **참석 현황은 admin 만**) | 멤버 |
| `list_push_status` | — | 멤버별 웹푸시 구독 여부 | 멤버 |
| `send_push` | `member_ids`(uuid[]), `title`, `message` | 지정 멤버에게 인앱+웹푸시 발송 | **admin** |
| `send_kakao_notice` | `message`(최대 4000자), `mentions?`(이름[]), `request_id?`, `dry_run?` | 크루 카톡 단톡방에 노티봇 공지(자유 문구) — 방은 서버 설정으로 고정, 어드민 발송 이력에 남음 | **admin** |
| `create_gathering` | `gthr_nm`, `gthr_type_enm`, `sprt_cd`, `stt_at`, `end_at?`, `loc_txt?`, `desc_txt?`, `max_prt_cnt?`, `dry_run?` | 새 모임(벙) 개설 — 작성자 자동 참석 + 팀 전원 알림 | **admin** |
| `create_sch_post` | `sch_nm`, `post_type`(`race_entry`·`sale`·`session`·`general`), `evt_stt_at`, `evt_end_at?`, `url?`, `cont_txt?`, `dry_run?` | 일정 탭에 소식(대회 접수 정보·판매·세션·일반) 등록 — 팀 전원 새 정보 알림 | 멤버 (앱과 같음) |

### 마일리지런 개인 도구 (내 기록)

위 도구들이 "운영진이 팀을 들여다보는" 것이라면, 아래는 전부 **내 기록**입니다.
대상 멤버를 인자로 받지 않고 토큰의 신원으로만 스코프하므로, **admin이어도 남의 기록에는 손대지 못합니다.**
`evt_id`(이벤트 uuid)도 인자가 아닙니다 — 서버가 "지금 진행 중이고 내가 승인된 참가 이벤트"를 찾아 채웁니다.

| 도구 | 입력 | 하는 일 | 권한 |
|------|------|---------|------|
| `list_my_activities` | `date?` 또는 `from?`·`to?` (기본 이번 달) | 내 활동 로그 — 날짜·종목·거리·고도·적용 배율·최종 마일리지·후기 | 본인 |
| `get_my_mileage` | `month?`(YYYY-MM, 기본 당월) | 내 그 달 목표·달성 마일리지·달성 여부·남은 양 | 본인 |
| `list_mileage_multipliers` | `active_only?` | 배율 이벤트 목록 — 고를 수 있는 배율 이름 확인 | 본인 |
| `log_my_activity` | `act_dt`, `sport`, `distance_km`, `elevation_m?`, `review?`, `multipliers?` | 활동 1건 등록 | 본인 |
| `log_my_activities` | `activities[]` (최대 20건) | 몰아서 등록 — 한 건이라도 걸리면 아무것도 저장 안 함 | 본인 |
| `update_my_activity` | `act_id` + 수정값 | 오타 정정 | 본인 |
| `delete_my_activity` | `act_id` | 삭제 | 본인 |

- **마일리지는 서버가 계산합니다.**
- **배율은 자동으로 붙지 않습니다.** 배율마다 성립 조건(모임 참석 여부·벙주/참석자·LSD 인원수 등)이
  다른데 서버는 그걸 알 수 없어서, **해당되는 것만 `multipliers`에 이름으로 골라 넣습니다** —
  앱 폼의 체크박스와 같습니다(안 적으면 배율 없이 계산). 이름은 `list_mileage_multipliers`가
  알려주고, 그날 유효하지 않은 이름은 조용히 빠지지 않고 **거부되며 고를 수 있는 목록을 답에
  실어 줍니다**.
- **수정은 안 준 항목을 건드리지 않습니다**(PATCH). `update_my_activity`는 `act_id` 말고
  **전부 선택**이라 고치려는 것만 보내면 되고, 안 준 항목은 **기존 값이 그대로 남습니다** —
  거리 오타만 고치러 온 호출에서 후기·고도가 조용히 날아가지 않게. 지우려면 명시합니다:
  `review=null` / `elevation_m=0` / `multipliers=[]`.
- ⚠️ **사진은 못 붙입니다.** 파일이 MCP의 JSON 경계를 못 넘습니다. 사진이 마일리지런 기록을
  기강이야기(깅스타그램)에 세우는 조건이라, **MCP로 넣은 기록은 전광판에 뜨지 않습니다** —
  수치·후기는 정상 저장됩니다. 사진까지 올리려면 앱(프로젝트탭)을 쓰세요.
- 앱과 **같은 규칙**이 그대로 걸립니다: 승인된 참가자만, 미래 날짜 불가, 2개월 이전 불가,
  전월 기록은 매월 3일까지. 등록 후 다음 달 목표까지 자동 재계산됩니다.
- 참가 승인·배율 생성·이벤트 관리처럼 **남의 돈과 판이 걸린 쓰기는 없습니다.**

예시 질문:
- "7월 12일 기록 뭐였지?" / "이번 달 내 기록 다 보여줘"
- "8월 12일 러닝 12km 고도 80 넣어줘" / "오늘 정기런 갔으니까 정기런 배율 붙여서 넣어줘"
- "지난주 러닝 세 개 한꺼번에 넣어줘"
- "이번 달 목표까지 얼마 남았어?"
- "아까 넣은 거 12km 아니라 12.4km야"
- "지금 걸려 있는 배율 뭐 있어?"

> 러닝 프로필·모임 설명은 **뉴비 ↔ 모임 매칭**을 위한 것입니다. `list_recent_members`(최근 가입자=뉴비 + 레벨·위치·목적)와 `list_today_gatherings`(모임 난이도 설명)를 함께 쓰면 AI가 적절한 모임을 추천할 수 있습니다.

예시 질문:
- "오늘 일정 몇 명 와?"
- "최근에 가입한 사람 누구야?" / "방금 가입한 뉴비 레벨·사는 곳 보여줘"
- "요즘 모임 안 나오는 사람 순으로 보여줘. 그 중 오래 안 온 2명만 추천해줘"
- "이 뉴비한테 이번 주 모임 중 레벨 맞는 거 추천해줘"
- (admin) "홍길동한테 '이번 주 벙 잊지 마세요' 알림 보내줘"
- (admin) "이번 주 정기런 장소가 잠수교로 바뀌었다고 단톡방에 공지해줘. 보내기 전에 문구 먼저 보여줘"
- (admin) "8월 29일 아침 7시 잠수교 정기런 벙 올려줘. 최대 20명"
- (admin) (카톡 공지 원문을 붙여넣고) "이거 벙으로 등록해줘. 저장 전에 날짜 맞는지 먼저 보여줘"
- (대회 접수 공지를 붙여넣고) "11월 20일 오전 10시 서울마라톤 접수 오픈, 소식으로 올려줘. 저장 전에 날짜 먼저 보여줘"

> **연락처·이메일·계좌 정보는 어떤 도구도 반환하지 않습니다.** (가까운 역은 크루 매칭용으로 이미 프로필에 공개되는 값)

### 권한 경계 — "앱에서 보이는 만큼만"

토큰은 **가입 완료 멤버 누구나** 발급할 수 있으므로, MCP 가 앱보다 넓은 창구가 되면 안 됩니다.
기준은 하나입니다 — **앱에서 관리자에게만 보이는 데이터는 MCP 에서도 admin 에게만.**

| 대상 | 왜 admin 인가 |
|------|---------------|
| `list_members_attendance` (도구째) | 같은 통계가 앱엔 관리자 전용 화면(`admin/members` 참여 현황)에만 있습니다 |
| `get_member_profile` 의 **생년월일·성별** (필드만) | 공개 프로필 카드(`get_public_member_card`)에 없는 값이고, 앱에선 관리자 화면·본인 프로필 수정에만 보입니다 |
| `list_gathering_non_attendees` 의 **참석 횟수·마지막 참석시각** (필드만) | 위 `list_members_attendance` 와 **같은 통계**입니다. 도구 하나만 막으면 옆 도구로 그대로 나갑니다 |
| `send_push` (도구째) | 쓰기 — 되돌릴 수 없고 크루원에게 직접 나갑니다 |
| `send_kakao_notice` (도구째) | 쓰기 — 되돌릴 수 없고 단톡방 크루 전원에게 보입니다 |
| `create_gathering` (도구째) | 쓰기 — 만드는 순간 팀 전원에게 새 모임 알림이 나갑니다 |

`create_sch_post`(일정 소식 등록)는 **admin 전용이 아닙니다.** 앱에서 소식은 활성 멤버 누구나 올리고
(`createSchPost` 의 `withActive`), MCP 토큰도 활성 멤버만 통과하므로 같은 범위입니다 — 앱보다 넓지도
좁지도 않습니다. 팀은 토큰의 팀으로만 정해지고(인자로 `team_id` 를 넣어도 무시), 작성자는 토큰 주인입니다.

### 모임 개설(`create_gathering`) — 쓰기 도구라 몇 가지 약속이 있습니다

- **일시는 한국시간 `YYYY-MM-DD HH:mm`.** `Z`나 `+09:00` 같은 시간대 표기를 붙이면 **거부**합니다.
  섞어 받으면 9시간이 조용히 밀린 채 저장돼(에러도 안 납니다) 벙이 엉뚱한 시각에 섭니다.
- **먼저 `dry_run: true` 로 불러 보세요.** 저장하지 않고 해석된 일시·장소만 돌려줍니다.
  카톡 공지 원문처럼 자연어에서 날짜를 뽑을 땐 이 단계로 사람이 눈으로 확인한 뒤 저장하는 게 안전합니다.
- **종료가 시작보다 앞서면 거부합니다.** 그런 모임은 달력 뷰에서 통째로 사라지면서 참가 신청은 계속 받습니다(#495).
- 만들면 **앱에서 만든 것과 똑같이** 작성자가 자동 참석되고 팀 전원에게 새 모임 알림이 나가며,
  카톡 단톡방에도 노티봇 공지가 같은 문구로 뜹니다(노티봇 발송 설정이 있는 환경만 — local·preview 는
  설정이 없어 `skipped` 로 넘어가고 공지가 안 나갑니다).
  응답에 `gthr_url`(상세 링크)·`stt_at_kst`(저장된 시각)·`notified_cnt`(실제 알림 인원)·
  `kakao_notice`(단톡방 공지 `sent` / `skipped` / `failed`)가 실립니다. `failed` 면 모임 공유 시트의
  「단톡방에 알림」으로 다시 보내세요.
- 수정·삭제 도구는 없습니다 — 잘못 만들었으면 `gthr_url` 로 들어가 웹에서 고치거나 지우세요.

### 일정 소식 등록(`create_sch_post`) — `create_gathering` 과 같은 약속

- **일시는 한국시간 `YYYY-MM-DD HH:mm`.** `Z`·`+09:00` 표기, 날짜만(`2026-11-20`), "다음 주 월요일"
  같은 자연어는 **거부**합니다(9시간 밀림 방지 — 모임 개설과 같은 파서를 씁니다).
- **먼저 `dry_run: true` 로 불러 보세요.** 저장하지 않고 해석된 일시·유형만 돌려줍니다.
- **종료가 시작보다 앞서면 거부합니다.** 같은 시각은 받습니다(“접수 오픈 10:00”처럼 한 시점짜리 소식).
- 만들면 **앱에서 올린 것과 똑같이**(같은 저장·알림 코어 `lib/sch-post.ts`) 작성자를 뺀 팀 전원에게
  새 정보 알림이 나갑니다. 단톡방 노티봇 공지는 없습니다 — 앱의 소식 등록에도 없습니다.
  응답에 `sch_post_id`·`sch_post_url`(일정 탭 상세 링크)·`evt_stt_at_kst`/`evt_end_at_kst`(저장된 일시)·
  `crt_at_kst`(저장 시각)·`notified_cnt`(실제 알림 인원)가 실립니다.
- 수정·삭제 도구는 없습니다 — 잘못 올렸으면 `sch_post_url` 로 들어가 웹에서 고치거나 지우세요
  (앱 규칙대로 작성자 본인 또는 관리자만, 지난 일정은 관리자만).

### 단톡방 공지(`send_kakao_notice`) — 되돌릴 수 없는 쓰기라 약속이 있습니다

- **방은 고를 수 없습니다.** 서버 환경 설정(`KAKAO_ROOM_ID` → 없으면 `KAKAO_ROOM`)의 크루 단톡방으로만 갑니다 —
  인자로 방을 받으면 엉뚱한 방으로 새는 길이 생깁니다.
- **먼저 `dry_run: true` 로 불러 보세요.** 보내지 않고 보낼 방(`room`)·본문·태그와 `request_id` 를 돌려줍니다.
  사람이 확인한 뒤 **그 `request_id` 를 그대로 넣어** 실제로 보내면, 같은 공지를 두 번 부르더라도 허브가 두 번 보내지 않습니다.
  `will_send: false`(=`room: null`)면 이 환경엔 노티봇이 없어 실제로 불러도 안 나갑니다.
- **`request_id` 를 안 주면 서버가 만들어 응답에 싣습니다.** 같은 값으로 다시 부르면 허브가 중복 발송을 막고,
  응답은 `status: "duplicate"` 로 옵니다 — 단톡방엔 앞선 한 건만 있고, 실패가 아니니 다시 보낼 일도 없습니다.
  발송 이력에도 「중복(허브가 막음)」으로 남아 성공·실패 어느 쪽으로도 세지 않습니다.
- **서버는 재시도하지 않습니다**(중복이 유실보다 나쁩니다). 응답 `status` 는
  `sent`(허브 접수 — 카톡 전달 확인은 아님) / `duplicate`(같은 `request_id` 가 이미 접수돼 새로 안 보냄) /
  `skipped`(노티봇 발송 설정이 없는 환경) / `failed` 이고,
  `failed` 면 `failure`(`name`·`code`·`http_status`·`message`·`retryable`)가 실립니다.
- **태그(`mentions`)** 는 이름 목록입니다. 본문의 `@이름` 자리가 태그가 되고, 없으면 맨 앞에 붙습니다.
  단톡방 참여자 한 명으로 정해지지 않는 이름이면 허브가 보내지 않고 `failed`(`mention_name_unknown` / `mention_name_ambiguous`)로 돌아옵니다.
- 보낸 건은 성공·실패 모두 **어드민 「카카오 발송 이력」(`/admin/kakao`)에 출처 `MCP 공지`** 로 남고, 보낸 사람이 기록됩니다.
  감사 로그(`mcp_audit_log`)에도 한 줄 남습니다(이력의 출처 id = 감사행 id).

`get_member_profile`·`list_gathering_non_attendees` 를 **통째로** 막지 않는 이유:
**뉴비↔모임 매칭**(러닝 프로필 조회)이 이 MCP 의 주 용도이고, "이 벙에 누가 안 왔나"는 앱에서 참석자 목록이
공개라 뒤집으면 나오는 사실입니다. 막아야 하는 건 앱이 공개하지 않는 필드뿐입니다.

> 미참석자 목록은 비-admin 에게 **이름순**으로 나갑니다. 참석 순으로 늘어놓으면 숫자를 지워도
> **줄 순서가 곧 "누가 더 오래 안 나왔나"** 라서, 가린 척이 됩니다.

---

## 5. 배포 시 주의 (개발자)

- 이 기능은 DB 테이블 2개를 추가합니다:
  - `supabase/migrations/20260724150000_mcp_token_rel.sql` (개인 토큰)
  - `supabase/migrations/20260724180000_mcp_audit_log.sql` (발송 감사)
- 단톡방 공지(`send_kakao_notice`)의 중복 표시는 발송 이력 상태값을 하나 넓힙니다(데이터 변경 없음):
  - `supabase/migrations/20261107100000_kakao_send_hist_status_duplicate.sql` (CHECK 에 `duplicate` 추가, NOT VALID)
  - `supabase/migrations/20261107100100_kakao_send_hist_status_duplicate_validate.sql` (제약 검증)
  - **dev·prod Supabase 에 릴리스 전 선적용**하세요. 앱이 먼저 나가면 중복 응답의 이력 행이 제약에 걸려 안 남습니다
    (발송·MCP 응답은 영향 없음 — 이력 기록 실패는 로그만 남깁니다).
- **각 환경의 Supabase에 이 마이그레이션이 선적용돼야** 인증·발송이 동작합니다. 미적용 시 인증이 전부 401로 실패합니다(모임 취소 릴리스 전례와 동일 함정). 특히 **prod 릴리스 시 선적용 필수.**
- 두 테이블 모두 RLS on + 정책 0개 = **service_role 전용**입니다.

---

## 6. 트러블슈팅

| 증상 | 원인·조치 |
|------|-----------|
| `401` / 연결 실패 | 토큰 오타·만료·폐기, 또는 비활성 멤버. `/mcp-tokens`에서 새 토큰 발급. |
| `Connected` 안 뜸 | URL 확인(`/api/mcp/mcp`), 등록 후 **세션 재시작**. 해당 환경 배포·마이그레이션 상태 확인. |
| `send_push`가 거부됨 | owner/admin 역할만 발송 가능. 조회는 가능. |
| `send_kakao_notice`가 거부됨 | 단톡방 공지는 owner/admin 전용입니다(`dry_run` 도). |
| `send_kakao_notice`가 `skipped` | 이 환경엔 노티봇 발송 설정(허브 주소·API 키·방)이 없습니다. 설정이 없는 환경은 안 나갑니다(안전장치). |
| `send_kakao_notice`가 `duplicate` | 같은 `request_id` 를 허브가 이미 받아 둬서 새로 보내지 않았습니다 — 단톡방엔 앞선 한 건만 있습니다. 정상입니다. 정말 한 번 더 보내야 하면 **새** `request_id` 로 부르세요(그러면 두 번째 공지가 실제로 나갑니다). |
| 같은 `request_id` 재호출인데 `sent` 로 두 번 남음 | 이 기능 전(#631 이전)에 쌓인 이력이거나, 허브가 그 응답에 `duplicate` 를 싣지 않은 경우입니다. 단톡방에 실제로 몇 건 갔는지는 허브 발송 이력에서 확인하세요. |
| `send_kakao_notice`가 `failed` | `failure.code` 를 보세요. `mention_name_unknown`·`mention_name_ambiguous` 는 태그 이름을 고쳐 **새로** 보내고, `retryable: true`(타임아웃·네트워크·429·5xx)면 **같은 `request_id`** 로 다시 부르거나 `/admin/kakao` 의 「다시 보내기」를 쓰세요. 새 `request_id` 로 보내면 이미 접수됐던 건이 한 번 더 나갈 수 있습니다. `idempotency_conflict` 는 이미 접수된 건입니다 — 다시 보내지 마세요. |
| 어드민 「다시 보내기」로 보낸 공지에 태그가 빠짐 | 발송 이력은 본문만 저장하고 태그 목록은 저장하지 않아, 다시 보내기는 태그 없이 `@이름` 글자로 나갑니다. 태그가 중요하면 「다시 보내기」 대신 MCP 에서 같은 `request_id`·`mentions` 로 다시 부르세요. |
| `create_gathering`이 일시를 거부함 | 한국시간 `YYYY-MM-DD HH:mm` 로 주세요. `Z`·`+09:00` 표기와 "내일 아침" 같은 자연어는 받지 않습니다. |
| 모임을 잘못 만들었음 | 응답의 `gthr_url` 로 들어가 웹에서 수정·취소하세요(MCP엔 수정·삭제 도구가 없습니다). 이미 나간 알림은 되돌릴 수 없습니다. |
| `create_sch_post`가 일시를 거부함 | 한국시간 `YYYY-MM-DD HH:mm` 로 주세요. `Z`·`+09:00`·날짜만·자연어는 받지 않습니다. 종료가 시작보다 앞서도 거부됩니다. |
| `create_sch_post`가 유형을 거부함 | `post_type` 은 `race_entry`(대회 접수)·`sale`(판매)·`session`(세션)·`general`(일반) 중 하나입니다. |
| 소식을 잘못 올렸음 | 응답의 `sch_post_url` 로 들어가 웹에서 수정·삭제하세요(작성자 본인·관리자만). 이미 나간 알림은 되돌릴 수 없습니다. |
| 마일리지 기록이 "승인된 참가 정보가 없다"고 거부됨 | 프로젝트탭에서 참가 신청 후 운영진 승인을 받아야 합니다. |
| MCP로 넣은 기록이 기강이야기에 안 보임 | 정상입니다 — 사진이 있어야 그 지면에 섭니다. MCP는 사진을 못 붙입니다. 앱에서 사진을 추가하면 올라옵니다. |
| 사진이 붙은 기록이 삭제되지 않음 | 앱(프로젝트탭)에서 지워 주세요. 사진 파일까지 함께 정리해야 합니다. |
| `list_members_attendance`가 거부됨 | 참석 현황은 owner/admin 전용입니다(§4 권한 경계). 특정 모임 미참석자 **명단**은 멤버도 조회할 수 있습니다(참석 횟수는 빠집니다). |
| 미참석자 목록에 참석 횟수가 안 나옴 | 그 두 칸은 owner/admin 응답에만 실립니다. 멤버에게는 이름순 명단만 나갑니다. |
| 프로필에 생일·성별이 안 나옴 | 두 필드는 owner/admin 응답에만 실립니다. 나머지 프로필·러닝 프로필은 멤버도 그대로 받습니다. |
| 특정 멤버가 발송에서 빠짐 | 타 팀·비활성·미존재이거나 알림 수신거부. 발송은 우리 팀 활성 멤버로만 나갑니다. |
| 토큰을 잃어버림 | 다시 볼 수 없습니다. 기존 토큰 폐기 후 새로 발급하세요. |

---

## 7. 도구 추가·변경 절차 (개발자)

**앱에 기능을 추가·변경하면 이 MCP 도구도 같은 PR에서 추가·변경합니다.** 안 넣을 거면 PR 템플릿
「운영 MCP 반영」에 이유를 적습니다([ADR-0006](../../../docs/decisions/0006-ops-mcp-with-feature.md)).

1. **도메인 로직은 `lib/` 코어로 뺀다.** `app/actions/**` 서버 액션은 Supabase 세션 쿠키에 묶여 있어
   MCP(`Authorization: Bearer <PAT>`)에서 그대로 부를 수 없습니다. 클라이언트를 주입받는 함수로 빼서
   액션·MCP가 공유합니다(예: `lib/mileage-run.ts`, `lib/mcp/create-gathering.ts`).
2. **입력 검증은 앱과 같은 스키마**(`lib/validations/*`)를 씁니다.
3. **`app/api/mcp/[transport]/route.ts`에 `server.registerTool`로 등록**합니다. 신원·팀은 인자가 아니라
   토큰 컨텍스트(`OperatorContext` — `ctx.mem_id`·`ctx.team_id`·`ctx.is_admin`)에서 옵니다.
   권한은 앱과 같게 두고(§4 권한 경계), admin 판정은 핸들러가 아니라 쿼리·발송 함수 안에 둡니다.
4. **앱 쓰기 경로가 하는 부수효과(캐시 무효화·알림 등)를 MCP 경로에서도 맞춥니다.** 액션의
   `revalidateTag`·`revalidatePath` 등은 각 경로가 따로 맡습니다.
5. **테스트**를 `app/api/mcp/__tests__/`에 추가합니다.
6. **이 문서 §4 도구 표**에 한 줄 더하고, 쓰기 도구라면 약속(§4 아래 절)과 §6 트러블슈팅도 갱신합니다.

문의: 운영/개발 담당(테크리드).
