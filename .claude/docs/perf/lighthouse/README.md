# Lighthouse 성능 분석 문서

## 버전 구조

| 버전 | 측정일 | Performance | 설명 |
|------|--------|-------------|------|
| [v1/](v1/performance-analysis.md) | 2026-06-19 | **49점** | 최초 측정 — 개선 전 베이스라인 |
| [v2/](v2/performance-analysis.md) | 2026-06-19 | **83점** | PR #328·#329 개선 후 — 목표 초과 달성 |
| [v3/](v3/performance-analysis.md) | 2026-06-20 | **76점** | PR #335 (`--webpack` 고정) 후 올바른 베이스라인 재확립 |

## 주요 변화 요약

| 지표 | v1 | v2 | v3 | v2→v3 |
|------|----|----|-----|-------|
| Performance | 49 | 83 | **76** | -7 |
| TBT | 1,810ms | **150ms** | 910ms ⚠️ | +760ms |
| LCP | 5.6s | 3.6s | **2.4s** ✅ | -1.2s |
| SI | 4.7s | 6.4s | **3.0s** ✅ | -3.4s |
| TTI | 5.8s | 4.9s | 5.1s | +0.2s |

> v3 TBT 악화 원인: PR #330~#335 사이 기능 추가(recharts, @uiw/react-md-editor 등)로 번들 증가. LCP·SI는 오히려 개선. TBT 최적화가 v4 핵심 과제.

## 관련 문서

- [v1/improvement-plan.md](v1/improvement-plan.md) — v1 → v2 개선 계획 및 작업 기록
- [v1/lighthouse-reading-guide.md](v1/lighthouse-reading-guide.md) — Lighthouse 지표 읽는 법
