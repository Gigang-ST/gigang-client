---
name: pr
description: "feature 브랜치에서 dev 대상 PR을 생성하는 스킬. 관련 GitHub 이슈를 자동으로 찾고, AS-IS/TO-BE 비교, Mermaid 흐름도(흐름 변경 시), 주요 변경 사항을 포함한 직관적인 PR 본문을 작성한다. /pr 명령으로 실행."
---

# PR 생성 스킬

현재 브랜치의 변경 사항을 분석하여 `dev` 브랜치 대상으로 GitHub PR을 생성한다.
리뷰어가 한눈에 파악할 수 있도록 구조화된 PR 본문을 자동으로 작성한다.

## 워크플로우

### 1단계: 현재 상태 파악

다음 명령을 **병렬로** 실행하여 현재 브랜치 상태를 수집한다:

```bash
# 현재 브랜치명 확인
git branch --show-current

# dev 브랜치 대비 전체 커밋 로그
git log dev..HEAD --oneline

# dev 브랜치 대비 전체 diff
git diff dev...HEAD

# 스테이징 안 된 변경 사항 확인
git status

# 리모트 동기화 여부 확인
git log --oneline @{upstream}..HEAD 2>/dev/null || echo "no upstream"
```

### 2단계: 관련 GitHub 이슈 검색

브랜치명과 커밋 메시지에서 키워드를 추출하여 GitHub 이슈를 검색한다:

```bash
# 브랜치명에서 키워드 추출 (예: feature/login-fix → login fix)
# 오픈 이슈 중에서 관련 이슈 검색
gh issue list --state open --search "<키워드>" --limit 10
```

- 관련 이슈가 있으면 → `closes #번호` 형태로 연결
- 관련 이슈가 없으면 → "관련 이슈 없음"으로 명시

### 3단계: PR 제목 생성

CLAUDE.md의 Conventional Commits 형식을 따른다:

- 커밋 히스토리를 분석하여 적절한 type을 결정 (`feat`, `fix`, `refactor` 등)
- scope는 변경된 주요 도메인으로 설정 (선택사항)
- 설명은 한국어로 간결하게 작성

예시: `feat(auth): 카카오 로그인 추가`, `fix(races): 대회 등록 RLS 차단 해결`

### 4단계: PR 본문 작성

`references/pr-template.md`의 템플릿을 기반으로 PR 본문을 작성한다.

#### 필수 섹션

- **관련 이슈**: 2단계에서 찾은 이슈 또는 "관련 이슈 없음"
- **요약**: 1~3줄로 PR의 목적 설명
- **AS-IS (변경 전)**: 현재 동작/구조/문제점을 구체적으로 기술
- **TO-BE (변경 후)**: 변경 후 동작/구조/개선점을 구체적으로 기술

#### 조건부 섹션

- **변경 흐름 (Mermaid)**: 로직 흐름, 데이터 흐름, 컴포넌트 구조 등에 변경이 있는 경우에만 포함. 단순 스타일/텍스트/설정 변경은 생략한다. Mermaid `flowchart`, `sequenceDiagram`, `stateDiagram-v2` 중 변경 내용에 적합한 다이어그램을 선택한다.

### 5단계: PR 생성

```bash
# 리모트에 푸시 (upstream 설정)
git push -u origin <현재브랜치>

# PR 생성 (base는 항상 dev)
gh pr create --base dev --title "<제목>" --body "$(cat <<'EOF'
<본문>
EOF
)"
```

## 중요 규칙

- **base 브랜치**: 항상 `dev` (절대 `main` 대상으로 PR 생성하지 않는다)
- **언어**: PR 제목의 설명과 본문 전체를 한국어로 작성 (type/scope는 영문)
- **Mermaid 다이어그램**: 흐름 변경이 있을 때만 포함. 불필요하게 추가하지 않는다
- **AS-IS / TO-BE**: 리뷰어가 "왜 이 변경이 필요한지" 바로 이해할 수 있도록 대비를 명확히 한다
- **코드 블록**: 주요 변경 사항에서 파일 경로를 백틱으로 감싸 가독성을 높인다
- **푸시 전 확인**: 스테이징 안 된 변경이 있으면 사용자에게 알린다
