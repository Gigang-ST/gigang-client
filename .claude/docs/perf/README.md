# 성능 최적화 (Performance)

기강 웹앱의 성능·안정성 최적화 문서 모음. 프론트엔드(번들·렌더)와 백엔드(DB·락) 모두 여기서 관리한다.

## 문서

| 영역 | 문서 | 내용 |
|------|------|------|
| 프론트엔드 | [lighthouse/](lighthouse/README.md) | Lighthouse 성능 측정·개선 이력 (v1~v3, TBT/LCP/SI 등) |
| 백엔드(DB) | [db-lock-management.md](db-lock-management.md) | DB 락 이론 + 대용량 실무 패턴 + 우리 적용(타임아웃·마이그레이션 규약) |

## 관련

- 마이그레이션 작성 규약(락 안전): [`supabase/migrations/README.md`](../../../supabase/migrations/README.md)
- DB 성능 가이드 스킬: `.claude/skills/supabase-postgres-best-practices/`
- React/Next 성능 스킬: `.claude/skills/vercel-react-best-practices/`

## 추가 규칙

성능·최적화 관련 문서는 새로 만들 때 이 폴더(`perf/`) 아래에 둔다.
(예: 번들 분석, 쿼리 튜닝, 캐싱 전략 등)
