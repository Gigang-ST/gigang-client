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
- 조회 6종은 팀 멤버면 누구나. **알림 발송(`send_push`)은 owner/admin 역할만** 됩니다.

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
| `list_today_gatherings` | `date?`(YYYY-MM-DD, 기본 오늘) | 오늘 모임 + 각 참석자 수 | 멤버 |
| `list_recent_members` | `limit?`(기본 10) | 최근 가입 멤버 | 멤버 |
| `list_members_attendance` | `limit?` | 멤버별 참석 횟수·마지막 참석일(오래 안 나온 순) | 멤버 |
| `get_member_profile` | `member_id`(uuid) 또는 `name` | 멤버 프로필(이름·생일·성별·가입일·역할·소개) | 멤버 |
| `list_gathering_non_attendees` | `gathering_id`(uuid) | 특정 모임 미참석자 + 참석 현황 | 멤버 |
| `list_push_status` | — | 멤버별 웹푸시 구독 여부 | 멤버 |
| `send_push` | `member_ids`(uuid[]), `title`, `message` | 지정 멤버에게 인앱+웹푸시 발송 | **admin** |

예시 질문:
- "오늘 일정 몇 명 와?"
- "최근에 가입한 사람 누구야?"
- "요즘 모임 안 나오는 사람 순으로 보여줘. 그 중 오래 안 온 2명만 추천해줘"
- "다음 주 토요일 러닝에 아직 신청 안 한 사람 알려줘"
- (admin) "홍길동한테 '이번 주 벙 잊지 마세요' 알림 보내줘"

> **연락처·이메일·계좌 정보는 어떤 도구도 반환하지 않습니다.**

---

## 5. 배포 시 주의 (개발자)

- 이 기능은 DB 테이블 2개를 추가합니다:
  - `supabase/migrations/20260724150000_mcp_token_rel.sql` (개인 토큰)
  - `supabase/migrations/20260724170000_mcp_audit_log.sql` (발송 감사)
- **각 환경의 Supabase에 이 마이그레이션이 선적용돼야** 인증·발송이 동작합니다. 미적용 시 인증이 전부 401로 실패합니다(모임 취소 릴리스 전례와 동일 함정). 특히 **prod 릴리스 시 선적용 필수.**
- 두 테이블 모두 RLS on + 정책 0개 = **service_role 전용**입니다.

---

## 6. 트러블슈팅

| 증상 | 원인·조치 |
|------|-----------|
| `401` / 연결 실패 | 토큰 오타·만료·폐기, 또는 비활성 멤버. `/mcp-tokens`에서 새 토큰 발급. |
| `Connected` 안 뜸 | URL 확인(`/api/mcp/mcp`), 등록 후 **세션 재시작**. 해당 환경 배포·마이그레이션 상태 확인. |
| `send_push`가 거부됨 | owner/admin 역할만 발송 가능. 조회는 가능. |
| 특정 멤버가 발송에서 빠짐 | 타 팀·비활성·미존재이거나 알림 수신거부. 발송은 우리 팀 활성 멤버로만 나갑니다. |
| 토큰을 잃어버림 | 다시 볼 수 없습니다. 기존 토큰 폐기 후 새로 발급하세요. |

문의: 운영/개발 담당(테크리드).
