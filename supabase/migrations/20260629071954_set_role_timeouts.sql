-- 락/실행/유휴 타임아웃을 앱 역할에 기본값으로 설정 (P0 안전망)
--
-- 배경: 2026-06-29 운영계 로그인 무한로딩. lock_timeout=0(무제한 대기)로 한 트랜잭션이
--   락을 오래 쥐자 뒤따르는 쿼리가 statement_timeout(120s)까지 줄줄이 막혀 커넥션 풀이 포화,
--   Auth까지 504가 났다. 상세 분석·이론: .claude/docs/perf/db-lock-management.md
--
-- 효과:
--   lock_timeout(3s)                         — 락 못 잡으면 기다리는 쪽이 빨리 포기(연쇄 마비 차단)
--   statement_timeout(10s)                   — 쿼리가 오래 실행되면 강제 취소
--   idle_in_transaction_session_timeout(15s) — 트랜잭션 열고 방치하는 세션 강제 종료(락 무한점유 차단)
--
-- 적용 대상: authenticated / anon / service_role (앱 트래픽 + 관리자 쓰기 경로)
-- 제외: postgres — 대형 마이그레이션이 짧은 statement_timeout에 죽지 않도록.
--   마이그레이션 락 안전은 파일 단위 `SET lock_timeout`(supabase/migrations/README.md)로 별도 처리.
-- 적용 시점: 새 커넥션부터. 풀러 환경에선 재접속 후 반영.
-- 비고: ALTER ROLE ... SET 은 멱등(여러 번 실행해도 안전).

-- 로그인 사용자
ALTER ROLE authenticated SET lock_timeout = '3s';
ALTER ROLE authenticated SET statement_timeout = '10s';
ALTER ROLE authenticated SET idle_in_transaction_session_timeout = '15s';

-- 비로그인 방문자
ALTER ROLE anon SET lock_timeout = '3s';
ALTER ROLE anon SET statement_timeout = '10s';
ALTER ROLE anon SET idle_in_transaction_session_timeout = '15s';

-- 서버 관리자 클라이언트(회비 재계산·칭호 엔진 등 쓰기 경로)
ALTER ROLE service_role SET lock_timeout = '3s';
ALTER ROLE service_role SET statement_timeout = '10s';
ALTER ROLE service_role SET idle_in_transaction_session_timeout = '15s';
