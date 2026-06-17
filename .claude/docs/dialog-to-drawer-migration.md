# Dialog → Drawer 전환 작업

## 목표

모든 다이얼로그를 shadcn `Drawer`(vaul 기반 바텀 시트)로 통일.

**이유**: 현재 다이얼로그가 중구난방이고, 모바일 PWA에서 바텀 시트가 훨씬 자연스러움. 닫기 버튼을 위로 올라가서 누르는 UX 문제도 해결됨 (드래그 다운으로 닫기).

---

## 작업 순서

### 1. shadcn Drawer 설치

```bash
pnpm dlx shadcn@latest add drawer
```

`components/ui/drawer.tsx`가 생성됨.

---

### 2. ResponsiveDrawer 공통 래퍼 생성

`components/common/responsive-drawer.tsx` 신규 생성.

- 모바일(`max-width: 768px`)에서는 → `Drawer` (바텀 시트)
- 데스크탑에서는 → `Dialog`
- 사용 인터페이스는 `Dialog`와 동일하게 맞춤

```tsx
// 사용 예시
<ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
  <ResponsiveDrawerContent>
    <ResponsiveDrawerHeader>
      <ResponsiveDrawerTitle>제목</ResponsiveDrawerTitle>
    </ResponsiveDrawerHeader>
    {/* 내용 */}
  </ResponsiveDrawerContent>
</ResponsiveDrawer>
```

구현 참고: [shadcn useMediaQuery + Drawer/Dialog 패턴](https://ui.shadcn.com/docs/components/drawer) — "Responsive Dialog" 예시 코드 있음.

---

### 3. 기존 다이얼로그 전환 대상 목록

아래 파일들을 `ResponsiveDrawer`로 교체.

| 파일 | 현재 | 비고 |
|------|------|------|
| `components/schedule/sch-post-detail-dialog.tsx` | Dialog | 댓글 포함, 콘텐츠 많음 → 우선순위 높음 |
| `components/schedule/sch-post-form-dialog.tsx` | Dialog | 소식 추가/수정 폼 |
| `components/admin/*` | Dialog (있다면) | 관리자 다이얼로그 |
| 그 외 Dialog 사용처 | - | `grep -r "Dialog"` 로 찾기 |

전체 목록 확인 명령:
```bash
grep -r "from \"@/components/ui/dialog\"" components/ app/ --include="*.tsx" -l
```

---

### 4. 전환 방법 (파일별 동일 패턴)

**Before:**
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>제목</DialogTitle>
    </DialogHeader>
    ...
  </DialogContent>
</Dialog>
```

**After:**
```tsx
import { ResponsiveDrawer, ResponsiveDrawerContent, ResponsiveDrawerHeader, ResponsiveDrawerTitle } from "@/components/common/responsive-drawer"

<ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
  <ResponsiveDrawerContent>
    <ResponsiveDrawerHeader>
      <ResponsiveDrawerTitle>제목</ResponsiveDrawerTitle>
    </ResponsiveDrawerHeader>
    ...
  </ResponsiveDrawerContent>
</ResponsiveDrawer>
```

---

### 5. SchPostDetailDialog 추가 개선 (Drawer 전환 시 같이)

- 고정 높이: `h-[85dvh]` 또는 `max-h-[85dvh]`
- 헤더 고정 + 내용만 스크롤
- 댓글 입력창은 하단 고정 (스크롤해도 항상 보이게)

---

## 주의사항

- `SchPostDetailDialog`의 댓글 섹션은 높이 고정 + 내부 스크롤 구조로 맞춰야 댓글 입력창이 항상 접근 가능
- Drawer는 `open=false`일 때 `display:none` 처리 방식이 Dialog와 다를 수 있음 — 언마운트 타이밍 확인 필요
- 기존 `max-w-md` 같은 너비 제한은 Drawer에서 의미 없음 (전체 너비) — 데스크탑 Dialog 모드에서만 적용
