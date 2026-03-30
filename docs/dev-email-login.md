# 개발 환경 전용 이메일 로그인

## 목적

운영에서는 카카오·구글 OAuth만 노출하고, **로컬 개발**과 **Vercel 개발계(gigang-client-dev)** 에서만 Supabase 이메일·비밀번호 로그인 UI를 보이게 한다.

`NEXT_PUBLIC_ENABLE_DEV_MODE`는 **이메일 로그인뿐 아니라** 같은 조건으로 켤 다른 개발 전용 클라이언트 UI에도 재사용할 수 있다.

## 동작 조건

`components/auth/dev-email-login.tsx`의 `isDevModeEnabled()`가 `true`일 때만 로그인 화면에 이메일 폼이 렌더된다.

- **로컬** (`pnpm dev`): `NODE_ENV === "development"` 이면 자동으로 `true`
- **Vercel 개발계**: 환경 변수 `NEXT_PUBLIC_ENABLE_DEV_MODE=true` 설정
- **운영**: 위 변수를 두지 않으면 `false` → UI 없음

## 관련 파일

| 파일 | 설명 |
|------|------|
| `components/auth/dev-email-login.tsx` | `isDevModeEnabled()` + 이메일 폼·`signInWithPassword` |
| `components/auth/login-form.tsx` | `isDevModeEnabled()`일 때 `DevEmailLogin` 마운트 |
| `.env.example` | `NEXT_PUBLIC_ENABLE_DEV_MODE` 안내(주석) |

## Supabase

해당 프로젝트에서 **Authentication → Providers → Email** 이 켜져 있어야 하며, 테스트용 사용자(이메일/비밀번호)가 있어야 로그인된다.

## 배포 후 확인

개발계에 환경 변수를 추가·변경한 뒤에는 **재배포**가 필요하다. (`NEXT_PUBLIC_*` 는 빌드 시 번들에 포함된다.)
