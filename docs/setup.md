# 로컬 개발 환경 셋업

## 사전 준비

| 도구 | 필수 | 용도 |
|------|------|------|
| [Git](https://git-scm.com/) | O | 소스 코드 관리 |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | O | Supabase 로컬 실행 |
| [mise](https://mise.jdx.dev/) | O | 도구 버전 관리 (Node, Supabase CLI 등) |
| [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) | O | 로컬 DB 및 마이그레이션 관리 |
| [Vercel CLI](https://vercel.com/docs/cli) | 선택 | 환경변수 pull (팀 Vercel 접근 권한 필요) |

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

### Windows

> Windows에서는 **WSL2** 환경에서 개발합니다. 이후 모든 작업은 WSL 터미널에서 진행합니다.

**1. WSL2 설치**

PowerShell(관리자)에서:

```powershell
wsl --install
```

재부팅 후 Ubuntu가 실행되면 사용자 이름/비밀번호를 설정합니다.

> BIOS에서 가상화(Intel VT-x / AMD-V)가 활성화되어 있어야 합니다.

**2. Git**

WSL Ubuntu에 기본 포함되어 있습니다. 없다면:

```bash
sudo apt update && sudo apt install git
```

**3. Docker Desktop**

[공식 사이트](https://www.docker.com/products/docker-desktop/)에서 설치하거나:

```powershell
winget install Docker.DockerDesktop
```

설치 후 WSL 연동 활성화:
Settings > Resources > WSL Integration > Ubuntu **활성화**

**4. mise**

WSL 터미널에서:

```bash
curl https://mise.run | sh

# 쉘 활성화 (bash 기준)
echo 'eval "$(~/.local/bin/mise activate bash)"' >> ~/.bashrc
source ~/.bashrc
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

환경변수 파일은 3종류입니다:

| 파일 | 용도 | 생성 방법 |
|------|------|-----------|
| `.env.development.local` | Supabase 로컬 개발 | `mise run env:local` |
| `.env.development` | Vercel preview 환경 | `mise run env:preview` |
| `.env.production` | Vercel production 환경 | `mise run env:production` |

```bash
# Docker Desktop 실행 후
supabase start
vercel login
mise run env:all
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

## 스크립트

| 명령어 | 설명 |
|--------|------|
| `pnpm run dev` | 개발 서버 실행 |
| `pnpm run build` | 프로덕션 빌드 |
| `pnpm run lint` | ESLint 검사 |
| `pnpm run storybook` | Storybook 실행 (포트 6006) |
