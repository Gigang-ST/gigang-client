# Lighthouse 성능 분석 문서

## 버전 구조

| 버전 | 측정일 | Performance | 설명 |
|------|--------|-------------|------|
| [v1/](v1/performance-analysis.md) | 2026-06-19 | **49점** | 최초 측정 — 개선 전 베이스라인 |
| [v2/](v2/performance-analysis.md) | 2026-06-19 | **83점** | PR #328·#329 개선 후 — 목표 초과 달성 |

## 주요 변화 요약

| 지표 | v1 | v2 | 변화 |
|------|----|----|------|
| Performance | 49 | **83** | **+34점** |
| TBT | 1,810ms | **150ms** | **-1,660ms** |
| LCP | 5.6s | **3.6s** | **-2.0s** |
| TTI | 5.8s | **4.9s** | **-0.9s** |

## 관련 문서

- [v1/improvement-plan.md](v1/improvement-plan.md) — v1 → v2 개선 계획 및 작업 기록
- [lighthouse-reading-guide.md](lighthouse-reading-guide.md) — Lighthouse 지표 읽는 법
