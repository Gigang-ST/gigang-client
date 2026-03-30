# 로컬 개발 환경 셋업

## 사전 준비

| 도구 | 필수 | 용도 |
|------|------|------|
| [Git](https://git-scm.com/) | O | 소스 코드 관리 |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | O | Supabase 로컬 실행 |
| [mise](https://mise.jdx.dev/) | O | 도구 버전 관리 (Node, Supabase CLI 등) |
| [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | O | 로컬 DB 및 마이그레이션 관리 |
| [Vercel CLI](https://vercel.com/docs/cli) | O | 환경변수 pull (팀 Vercel 접근 권한 필요) |

> **mise**를 설치하면 Node.js, Supabase CLI 등 필요한 도구가 `mise install` 한 번으로 자동 설치됩니다.

---

### macOS

**1. Git**

```bash
# Xcode Command Line Tools (Git 포함)
xcode-select --install
```

또는 Homebrew로 최신 버전 설치:

```bash
brew install git
```

**2. Docker Desktop**

```bash
brew install --cask docker
```

또는 [공식 사이트](https://www.docker.com/products/docker-desktop/)에서 DMG 다운로드 후 설치합니다.

**3. mise**

```bash
brew install mise

# 쉘 활성화 (zsh 기준)
echo 'eval "$(mise activate zsh)"' >> ~/.zshrc
source ~/.zshrc
```

---

## 설치

```bash
# 1. 저장소 클론
git clone <repo-url>
cd gigang-client

# 2. mise로 도구 일괄 설치
mise install

# 3. 패키지 설치
pnpm install
```

## 환경변수 설정

환경변수 파일은 3종류이며, `mise run env:all` 한 번으로 모두 생성됩니다:

| 파일 | 용도 |
|------|------|
| `.env.development.local` | Supabase 로컬 개발 |
| `.env.development` | Vercel preview 환경 |
| `.env.production` | Vercel production 환경 |

```bash
# Docker Desktop 실행 후
supabase start
vercel login
vercel link          # Vercel 프로젝트 연결 (최초 1회)
mise run env:all
```

Windows PowerShell에서는 아래 명령을 사용합니다:

```powershell
mise run env:all:pwsh
```

## 개발 서버 실행

```bash
pnpm run dev
```

[localhost:3000](http://localhost:3000/)에서 확인할 수 있습니다.

## Supabase 로컬 개발

```bash
# 로컬 서비스 시작 / 중지
supabase start
supabase stop

# DB 마이그레이션 상태 확인
supabase migration list

# 원격 DB 변경사항을 로컬로 가져오기
supabase db pull

# 로컬 변경사항으로 마이그레이션 생성
supabase db diff -f <migration_name>
```

---

### Windows

> Windows에서는 **PowerShell 기준**으로 안내합니다.

**1. Git**

[공식 사이트](https://git-scm.com/)에서 설치하거나:

```powershell
winget install Git.Git
```

**2. WSL2 설치 (권장)**

Docker Desktop은 Windows에서 일반적으로 WSL2 백엔드를 사용합니다.  
WSL2가 없으면 Docker Desktop 실행 시 오류가 발생할 수 있습니다.

```powershell
winget install Microsoft.WSL
```

설치 후 PC를 재시작하고, `wsl --status`로 상태를 확인합니다.

> 참고: Hyper-V 백엔드로도 구성할 수 있지만, 팀 기본 가이드는 WSL2 기준입니다.

**3. Docker Desktop**

[공식 사이트](https://www.docker.com/products/docker-desktop/)에서 설치하거나:

```powershell
winget install Docker.DockerDesktop
```

**4. Scoop + mise 설치**

PowerShell에서(권장: 일반 권한):

```powershell
# Scoop 설치 (미설치 시)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned -Force
irm get.scoop.sh | iex

# mise 설치
scoop install mise
```

**5. PowerShell 7(pwsh) 설치(미설치 시)**

`mise run env:all:pwsh`는 `pwsh`가 필요합니다.

```powershell
winget install Microsoft.PowerShell
```

설치 후 새 터미널을 열고 `pwsh --version`으로 확인합니다.

**6. mise 활성화 (PowerShell)**

```powershell
mise activate pwsh | Out-String | Invoke-Expression
```

**7. mise 실행 (도구 설치)**

저장소 루트에서 `mise.toml`에 정의된 도구(Node, Supabase CLI, Vercel CLI 등)를 설치합니다:

```powershell
mise install
```

매번 입력하기 싫다면 PowerShell 프로필에 추가합니다:

```powershell
notepad $PROFILE
```

열린 파일에 아래 1줄을 추가:

```powershell
mise activate pwsh | Out-String | Invoke-Expression
```

**8. 환경변수 파일 생성 (Windows PowerShell)**

Docker Desktop 실행 후, Supabase 로컬을 켜고 Vercel 인증/링크를 마친 다음 `mise.toml`에 정의된 PowerShell 태스크로 환경변수 파일을 생성합니다.

`env:all:pwsh` 단계 자체는 WSL 없이도 동작하지만, `supabase start`를 위해 Docker Desktop이 정상 실행되어야 합니다.

```powershell
supabase start
vercel login
vercel link
mise run env:all:pwsh
```





## 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 개발 서버 실행 |
| `pnpm run build` | 프로덕션 빌드 |
| `pnpm run lint` | ESLint 검사 |
| `pnpm run storybook` | Storybook 실행 (포트 6006) |
