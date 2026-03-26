$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Host $Message
  exit 1
}

# 사전 확인
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Fail "❌ supabase CLI가 설치되어 있지 않습니다"
}

if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
  Fail "❌ Vercel CLI가 설치되어 있지 않습니다. 'mise install'을 먼저 실행하세요"
}

$sbOut = & supabase status -o json 2>&1

# supabase status 출력에 경고/텍스트가 섞여 JSON 파싱이 깨질 수 있어 JSON 블록만 추출한다.
$sbOutText = ($sbOut | Out-String).Trim()
$jsonMatch = [regex]::Match($sbOutText, '\{[\s\S]*\}', [System.Text.RegularExpressions.RegexOptions]::Singleline)
if (-not $jsonMatch.Success) {
  Fail "❌ supabase status 출력에서 JSON을 찾지 못했습니다. 'supabase start'를 먼저 실행하세요`n$sbOutText"
}

# 중괄호 내부에 섞여 들어가는 "Stopped services: [...]" 라인을 제거해 유효한 JSON으로 만든다.
$sbJsonText = $jsonMatch.Value
$sbJsonText = [regex]::Replace($sbJsonText, '^\s*Stopped services:\s*\[[^\]]*\]\s*$', '', [System.Text.RegularExpressions.RegexOptions]::Multiline)

try {
  $sbJson = $sbJsonText | ConvertFrom-Json
} catch {
  Fail "❌ supabase status JSON 파싱에 실패했습니다. 'supabase start' 상태를 확인하세요`n$sbOutText"
}

if ($sbOutText -match 'Stopped services') {
  Write-Host "⚠️  supabase 일부 서비스가 중지 상태입니다(Stopped services). env 생성은 계속 진행합니다."
}

if (-not (Test-Path ".vercel/project.json")) {
  Fail "❌ Vercel 프로젝트가 연결되지 않았습니다. 'vercel link'를 먼저 실행하세요"
}

& vercel whoami *> $null
if ($LASTEXITCODE -ne 0) {
  Fail "❌ Vercel 인증이 필요합니다. 'vercel login'을 먼저 실행하세요"
}

# 1/3 Vercel preview env
$previewErr = & vercel env pull .env.development --environment=preview 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail "❌ Vercel preview 환경변수 가져오기 실패`n$previewErr"
}
Write-Host "✅ .env.development 생성 완료"

# 2/3 Vercel production env
$prodErr = & vercel env pull .env.production --environment=production 2>&1
if ($LASTEXITCODE -ne 0) {
  Fail "❌ Vercel production 환경변수 가져오기 실패`n$prodErr"
}
Write-Host "✅ .env.production 생성 완료"

# 3/3 Supabase local env
$apiUrl = $sbJson.API_URL
$anonKey = $sbJson.ANON_KEY
if (-not $apiUrl -or -not $anonKey) {
  Fail "❌ supabase status 출력에서 API_URL/ANON_KEY를 찾지 못했습니다. 'supabase start' 상태를 확인하세요`n$sbOut"
}

$localEnv = @"
# 자동 생성됨 (mise run env:all:pwsh)
NEXT_PUBLIC_SUPABASE_URL=$apiUrl
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$anonKey
"@

Set-Content -Path ".env.development.local" -Value $localEnv -Encoding utf8
Write-Host "✅ .env.development.local 생성 완료"

Write-Host ""
Write-Host "✅ 모든 환경변수 파일 생성 완료"

