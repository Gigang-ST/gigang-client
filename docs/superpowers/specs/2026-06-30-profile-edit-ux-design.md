# 프로필 수정 UX 재설계 — 저장 시 일괄 커밋

작성일: 2026-06-30
브랜치: `feature/profile-edit-ux`
대상 파일: `components/profile/profile-edit-form.tsx`, `app/actions/upload-avatar.ts`

## 배경 / 문제

현재 프로필 수정 화면([app/(info)/profile/edit/page.tsx](../../../app/(info)/profile/edit/page.tsx))은 저장 모델이 일관되지 않아 UX가 혼란스럽다.

1. **사진이 저장 버튼과 무관하게 즉시 반영됨** — 파일 선택 시 `handleAvatarUpload`가 곧바로 `uploadAvatar` 서버 액션을 호출하고, 액션이 그 자리에서 Storage 업로드 + `mem_mst.avatar_url` DB 커밋 + 기존 사진 삭제까지 끝낸다. 잘못 올려도 되돌릴 수 없다.
2. **사진 삭제(기본 폴백으로 되돌리기) 없음** — UI·서버 액션 어디에도 `avatar_url`을 null로 만드는 경로가 없다.
3. **저장 피드백이 약함** — 저장 후 폼 맨 아래 작은 인라인 텍스트만 뜨고, 자동으로 사라지지 않으며, 사진 변경 메시지와 자리를 공유해 혼란스럽다.

추가로: 디자인 시스템 위반(직접 `img`+`UserRound`, `<label>` 생짜, `text-[15px]` 등 매직넘버), 저장 버튼이 항상 활성, 업로드 중에도 저장 가능.

근본 원인: **"사진은 즉시 영구 반영, 나머지 필드는 저장 버튼으로 반영"이라는 두 저장 모델이 한 화면에 섞여 있다.**

## 목표

모든 변경을 **저장 시 단일 커밋**으로 통일한다. 저장 전에는 서버에 아무것도 반영되지 않으며, 미리보기는 전부 로컬에서 처리한다.

## 편집 대상 필드 (참고)

| 필드 | 편집 |
|------|------|
| 프로필 사진 | O |
| 이름 (full_name) | O |
| 성별 (gender) | O |
| 생년월일 (birthday) | O |
| 이메일 (email, 선택) | O |
| 연락처 (phone) | X (read-only) |

## 설계

### 1. 아바타 대기 상태 모델

폼은 아바타를 3가지 대기 상태로 관리하며, 저장 전까지 서버에 반영하지 않는다.

```
avatarState =
  | { kind: "current" }                  // 초기 — 기존 사진 그대로
  | { kind: "new", file, previewUrl }     // 새 사진 선택 (압축된 File + 로컬 objectURL)
  | { kind: "removed" }                   // 삭제 예약 → 기본 폴백
```

- 미리보기 렌더: `new` → `previewUrl`, `removed` → DiceBear seed 폴백, `current` → 기존 `avatar_url`(없으면 폴백)
- 사진을 여러 번 갈아끼워도 네트워크/Storage 요청이 발생하지 않는다 (objectURL은 교체 시 `revokeObjectURL`로 정리).

### 2. 컴포넌트 / 디자인 시스템 정합

- 직접 `img`+`UserRound` → **`Avatar` 컴포넌트** (`src` + `seed=member.id`). 카메라 오버레이는 Avatar를 감싼 버튼에 얹는다. 삭제 시 seed 폴백이 자동 적용된다.
- `<label>` 생짜 → shadcn **`Label`**
- `text-[15px]`·`text-xs` 등 매직넘버 → **typography 컴포넌트**(`Caption` 등)
- 사진 아래 **"기본 이미지로" 텍스트 버튼** 신설 — 지울 사진이 있을 때(`current`에 url 존재 또는 `new`)만 노출, 이미 폴백 상태면 숨김.

### 3. 클라이언트 압축 유틸 (신규)

`lib/image/compress-avatar.ts`:

- 입력 `File` → 출력 `File`
- JPG/PNG/WebP → canvas로 가운데 정사각형 크롭 + `imageSmoothingQuality: "high"` → 512px webp(quality 0.85) 반환
- HEIC/HEIF → 압축 불가 → 원본 그대로 반환 (서버가 `heic-convert`로 처리)
- canvas 처리 실패 시 원본 폴백 (안전)

압축 목적은 화질 저하가 아니라 업로드 용량 절감이다. 최종 저장 스펙은 512px webp로, 작은 아바타 표시(32~96px)엔 충분하고 미래의 큰 "프로필 보기"(레티나 DPR3 기준 ~170px 표시까지 선명)까지 대비한다. 512px webp는 ~60KB로 용량 부담이 거의 없다.

### 4. 저장 = 단일 서버 액션 (핵심 리팩터링)

기존 `app/actions/upload-avatar.ts`(고르는 즉시 업로드+DB커밋)를 폐기하고 `app/actions/update-profile.ts` 하나로 통합한다.

```
updateProfile(formData):
  입력 = { full_name, gender, birthday, email } + (newFile? | removeFlag?)
  1. withActive 인증 + 본인(member.id) 확인
  2. zod 서버 검증 (클라이언트와 양쪽 검증)
  3. 아바타 처리:
       newFile 있으면 → (HEIC 변환) → sharp 안전망 리사이즈(512px webp) → Storage 업로드 → newUrl
       removeFlag면   → newUrl = null
       둘 다 없으면   → avatar_url 미변경
  4. mem_mst 단일 update { mem_nm, gdr_enm, birth_dt, email_addr, (avatar_url?) }
       — vers=0, del_yn=false 조건 유지
  5. 교체/삭제된 경우 기존 Storage 파일 삭제 (실패 무시)
  6. { ok } | { error } 반환
```

→ 사진과 필드가 하나의 DB update로 함께 커밋되어 "저장"의 의미가 명확해진다. 서버는 클라 압축 여부와 무관하게 안전망 리사이즈를 한 번 수행한다(신뢰 불가한 클라 입력 방어 + HEIC 처리).

### 5. 저장 흐름 & 피드백

- 저장 버튼: 변경이 있을 때만 활성(폼 dirty OR `avatarState !== current`), 압축/제출 중 비활성, "저장 중..." 표시.
- 성공 → `toast.success("저장했어요")` + `router.back()` (프로필 화면 복귀).
- 실패 → `toast.error(메시지)`, 편집 화면 유지.
- 기존 인라인 메시지 텍스트 블록 제거 → 전역 토스트(sonner, 이미 `app/layout.tsx`에 설치됨)로 일원화.

### 6. 스코프 밖

- 이탈 시 dirty-guard 경고: 편집 필드가 적고(5개) 저장 전 미반영 모델이라 잃을 것이 작다. route-level 구현 비용 대비 이득이 낮아 이번 범위에서 제외. 필요 시 별도 작업.

## 영향 범위

- 수정: `components/profile/profile-edit-form.tsx` (상태 모델·UI·저장 흐름 전면 개편)
- 신규: `lib/image/compress-avatar.ts`, `app/actions/update-profile.ts`
- 폐기: `app/actions/upload-avatar.ts` (사용처가 이 폼뿐인지 확인 후 제거)
- `lib/validations/member.ts`의 `profileEditSchema` 재사용(서버에서도 검증)

## 검증 방법

- 사진 선택 → 저장 안 하고 이탈 → 서버에 변경 없음 확인
- 사진 여러 번 교체 → Storage에 파일 안 쌓임 확인
- "기본 이미지로" → 저장 → avatar_url null + 기존 파일 삭제 + DiceBear 폴백 표시
- 텍스트만 수정 → 저장 즉시 완료(업로드 없음)
- HEIC 사진 업로드 → 서버 변환 경로 동작
- 저장 성공 → 토스트 + 프로필 복귀 / 실패 → 토스트 + 화면 유지
