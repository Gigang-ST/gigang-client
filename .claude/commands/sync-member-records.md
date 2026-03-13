# 신규 회원 기록 동기화

신규 가입 회원의 대회 기록(race_result)과 대회 참가 등록(competition_registration)을 temp 파일 기반으로 DB에 동기화합니다.

## 절차

### 1단계: 데이터 소스 읽기
- `temp/기강의전당 - 마라톤-인증시트.csv` 읽기 (대회 기록)
- `temp/대회참여현황.txt` 읽기 (대회 참가 등록)

### 2단계: 회원 목록 조회
DB에서 active 회원 전체 조회:
```sql
SELECT id, full_name, joined_at FROM member WHERE status = 'active' ORDER BY joined_at DESC
```

### 3단계: 매칭 및 분석
각 회원의 full_name을 기준으로:

**인증시트(CSV)에서 매칭:**
- CSV의 "이름" 컬럼과 member.full_name 매칭
- 동명이인 주의 (예: 김소연(네이비), 김소연(블루) 등 괄호 표기 확인)
- 매칭된 기록의 race_date, race_name, event_type, record_time_sec 추출

**참여현황(TXT)에서 매칭:**
- 이름의 마지막 2글자(또는 고유한 부분)로 매칭
- 대회명 → competition 테이블에서 competition_id 조회
- event_type (Full, Half, 10K 등) 매핑

### 4단계: 중복 확인
이미 DB에 있는 기록과 비교:
```sql
SELECT race_name, race_date, event_type FROM race_result WHERE member_id = '{id}'
SELECT competition_id, event_type FROM competition_registration WHERE member_id = '{id}'
```

### 5단계: INSERT 실행
중복이 아닌 것만 INSERT. 각 INSERT 전에 내용을 사용자에게 보여주고 확인 받기.

## 기록 변환 규칙

**record_time_sec 계산:**
- "HH:MM:SS" → H*3600 + M*60 + S
- "050900" 같은 6자리 → 05:09:00으로 해석

**event_type 매핑:**
- FULL, HALF, 10K, 5K → 그대로
- 트레일러닝 → TRAIL
- 올림픽 (철인3종) → TRIATHLON_OLYMPIC
- 1K TT → 1K_TT
- 32K → 32K
- 종목이 불명확하면 사용자에게 확인

**참여현황 event_type 매핑:**
- Full → FULL
- Half → HALF
- 10K → 10K
- 100K, 50K, 37K → 그대로
- ★ (아이언맨) → 별도 확인

## 주의사항
- 동명이인이 있으면 사용자에게 확인
- 매칭 불확실한 이름은 건너뛰기
- 기존에 이미 들어간 기록은 중복 INSERT 하지 않기
- 참여현황의 대회가 competition 테이블에 없으면 건너뛰기 (신규 대회 등록은 별도)
- CSV에서 타임스탬프/성별은 참고용, 핵심은 이름/대회명/기록/날짜/종목
