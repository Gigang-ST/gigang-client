import Link from "next/link";
import { InAppBrowserGate } from "@/components/in-app-browser-gate";

/* ─── 토글 섹션 데이터 ─── */

const announcements = {
  title: "신입회원 안내말씀",
  icon: "📋",
  sections: [
    {
      heading: "📅 정기 러닝",
      items: [
        "격주 수요일 저녁 7:30 PM",
        "장소: 양재천 영동1교",
        "카카오톡에서 공지 확인",
      ],
    },
    {
      heading: "🙏 요청사항",
      items: [
        "카카오톡 오픈채팅 참여 필수",
        "정기 러닝 참석 시 카톡에 미리 표시",
        "모임 후 뒷정리 참여해 주세요.",
      ],
    },
  ],
  footer: "문의: IG @leegun_indie_pnk / 카카오톡 winsu",
};

const rules = [
  { label: "자유 모임 개설", desc: "누구나 자유롭게 모임을 만들 수 있습니다." },
  { label: "나이 제한", desc: "89년생부터 가입 가능 (88년생 이상은 불가)" },
  {
    label: "카톡 참석 표시",
    desc: "정기 러닝 참석 시 카카오톡에 미리 표시",
  },
  { label: "Sport Team 활동", desc: "팀 활동에 적극 참여해 주세요." },
  { label: "회비", desc: "월 2,000원" },
  { label: "기타", desc: "지각 시 스쿼트 등 재밌는 벌칙이 있어요 😄" },
];

const safetyRules = [
  { label: "보행자 조심", desc: "좁은 길에서는 한 줄로 달리기" },
  {
    label: "선두 수신호",
    desc: "선두가 방향 전환/정지 신호, 후미가 복명복창",
  },
  { label: "그룹 규모", desc: "최대 6명 그룹으로 나눠 달리기" },
  { label: "초보자 질주 금지", desc: "무리한 페이스는 부상의 원인!" },
];

const grades = [
  { grade: "런린이", criteria: "5km 러닝 불가" },
  { grade: "입문", criteria: "5km 30분 내 러닝 가능" },
  { grade: "초보", criteria: "대회 참여 경험자부터" },
  { grade: "중수", criteria: "꾸준히 대회 참여 & 기록 단축 중" },
  { grade: "고수", criteria: "실력자!" },
  { grade: "최고존엄", criteria: "넘사벽" },
];

const runTypes = [
  { name: "조깅", desc: "대화 가능한 편한 페이스 (회복/워밍업)" },
  {
    name: "LSD (Long Slow Distance)",
    desc: "천천히 오래 달리기 (지구력 향상)",
  },
  { name: "인터벌", desc: "빠르게/천천히 반복 (스피드 향상)" },
  { name: "지속주 (템포런)", desc: "일정 페이스 유지 (젖산역치 향상)" },
];

const activityChips = [
  { label: "🏃 러닝", color: "bg-blue-50 text-blue-600" },
  { label: "🚴 자전거", color: "bg-green-50 text-green-600" },
  { label: "🏊 수영", color: "bg-cyan-50 text-cyan-600" },
  { label: "⛰️ 등산", color: "bg-orange-50 text-orange-600" },
  { label: "🏅 대회", color: "bg-purple-50 text-purple-600" },
  { label: "🎉 외 활동 다수", color: "bg-amber-50 text-amber-700" },
];

/* ─── 토글 컴포넌트 ─── */

function Toggle({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <details className="overflow-hidden rounded-xl border border-border">
      <summary className="flex cursor-pointer items-center justify-between bg-secondary/50 px-4 py-3.5 text-sm font-bold [&::-webkit-details-marker]:hidden">
        <span>
          {icon} {title}
        </span>
        <span className="text-[10px] text-muted-foreground transition-transform [[open]>&]:rotate-180">
          ▼
        </span>
      </summary>
      <div className="border-t border-border px-4 py-4 text-xs leading-relaxed text-muted-foreground">
        {children}
      </div>
    </details>
  );
}

/* ─── 페이지 ─── */

export default function NewbiePage() {
  return (
    <InAppBrowserGate>
      <div className="mx-auto max-w-xl pb-28">
        {/* 1. 히어로 */}
        <section className="border-b border-border bg-white px-6 pb-9 pt-12 text-center">
          <p className="text-xs tracking-[3px] text-muted-foreground">
            WELCOME TO
          </p>
          <h1 className="mt-2 text-3xl font-extrabold">기강 🙌🏻</h1>
          <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground">
            양재천에서 같이 즐겁게 운동하는 사람들의 모임
            <br />
            언제든 모임을 만들거나 참여할 수 있습니다.
          </p>
        </section>

        {/* 2. 활동 소개 */}
        <section className="mx-4 mt-3 rounded-2xl border border-border bg-white p-6">
          <h2 className="text-sm font-bold">✨ 이런 활동을 해요.</h2>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {activityChips.map((c) => (
              <span
                key={c.label}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${c.color}`}
              >
                {c.label}
              </span>
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
            러닝 기반 2030 운동모임!
            <br />
            기억에 남을 만한 하루를 만들어봐요.
          </p>
        </section>

        {/* 3. 알아두면 좋은 것들 */}
        <section className="mx-4 mt-3 rounded-2xl border border-border bg-white p-6">
          <h2 className="text-sm font-bold">💬 알아두면 좋은 것들</h2>
          <div className="mt-3.5 text-[13px] leading-loose text-muted-foreground">
            <p>• 카카오톡에 사람이 더 많아요.</p>
            <p>
              • 모임장은 언제나 놀고 있으니 카톡 답변이 빠릅니다!
              <br />
              <span className="ml-3">
                카카오톡 ID: <strong className="text-foreground">winsu</strong>
              </span>
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {/* 토글 1: 신입회원 안내말씀 */}
            <Toggle icon={announcements.icon} title={announcements.title}>
              {announcements.sections.map((s) => (
                <div key={s.heading} className="mb-3 last:mb-0">
                  <h4 className="mb-1 text-[13px] font-bold text-foreground">
                    {s.heading}
                  </h4>
                  <ul className="list-disc pl-4">
                    {s.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="mt-2 text-xs">{announcements.footer}</p>
            </Toggle>

            {/* 토글 2: 회칙 */}
            <Toggle icon="📜" title="회칙">
              <ul className="space-y-1.5">
                {rules.map((r) => (
                  <li key={r.label}>
                    <strong className="text-foreground">{r.label}</strong> —{" "}
                    {r.desc}
                  </li>
                ))}
              </ul>
            </Toggle>

            {/* 토글 3: 러닝크루 안전수칙 */}
            <Toggle icon="🦺" title="러닝크루 안전수칙">
              <ul className="space-y-1.5">
                {safetyRules.map((r) => (
                  <li key={r.label}>
                    <strong className="text-foreground">{r.label}</strong> —{" "}
                    {r.desc}
                  </li>
                ))}
                <li>
                  <strong className="text-foreground">필수 준비물</strong> —
                  일정에 따라 꼭 챙겨주세요.
                  <br />
                  <span className="ml-3">🚴 자전거 → 헬멧</span>
                  <br />
                  <span className="ml-3">🌙 야간 등산 → 랜턴, 등산화 등</span>
                </li>
              </ul>
            </Toggle>

            {/* 토글 4: 러닝팁 */}
            <Toggle icon="💡" title="러닝팁">
              {/* 등급표 */}
              <h4 className="mb-1.5 text-[13px] font-bold text-foreground">
                🏅 등급표
              </h4>
              <table className="mb-4 w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-secondary/70">
                    <th className="border border-border px-2 py-1.5 text-left font-semibold">
                      등급
                    </th>
                    <th className="border border-border px-2 py-1.5 text-left font-semibold">
                      기준
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grades.map((g) => (
                    <tr key={g.grade}>
                      <td className="border border-border px-2 py-1.5">
                        {g.grade}
                      </td>
                      <td className="border border-border px-2 py-1.5">
                        {g.criteria}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* 심박수 & 페이스 */}
              <h4 className="mb-1.5 text-[13px] font-bold text-foreground">
                ❤️ 심박수 &amp; 페이스
              </h4>
              <p className="mb-4">
                심박수는 운동 강도의 지표입니다.
                <br />
                최대 심박수의 60~70% → 유산소 구간
                <br />
                최대 심박수의 80% 이상 → 무산소 구간
                <br />
                <br />
                페이스(min/km)는 1km를 달리는 데 걸리는 시간입니다.
              </p>

              {/* 러닝의 종류 */}
              <h4 className="mb-1.5 text-[13px] font-bold text-foreground">
                🏃 러닝의 종류
              </h4>
              <ul className="mb-4 list-disc space-y-1 pl-4">
                {runTypes.map((t) => (
                  <li key={t.name}>
                    <strong className="text-foreground">{t.name}</strong> —{" "}
                    {t.desc}
                  </li>
                ))}
              </ul>

              {/* 난이도 설정 */}
              <h4 className="mb-1.5 text-[13px] font-bold text-foreground">
                🎯 난이도 설정 방법
              </h4>
              <p className="mb-4">
                대화가 가능하면 → <strong className="text-foreground">Easy</strong>
                <br />
                문장이 끊기면 →{" "}
                <strong className="text-foreground">Moderate</strong>
                <br />
                단어만 나오면 → <strong className="text-foreground">Hard</strong>
                <br />
                <br />
                초보자는 Easy 70% + Moderate 30%로 시작하세요.
              </p>

              {/* 러닝화 */}
              <h4 className="mb-1.5 text-[13px] font-bold text-foreground">
                👟 러닝화
              </h4>
              <p>
                입문자에게는 쿠셔닝이 충분한 데일리 러닝화를 추천합니다.
                <br />
                나이키 페가수스, 아식스 노바블라스트, 호카 클리프톤 등이
                대표적이에요.
                <br />
                <br />
                자세한 건 모임에서 알려드릴게요! 👟
              </p>
            </Toggle>
          </div>
        </section>

        {/* 4. 채널 바로가기 */}
        <section className="mx-4 mt-3 rounded-2xl border border-border bg-white p-6">
          <h2 className="text-sm font-bold">🔗 채널 바로가기</h2>

          <div className="mt-3.5 flex items-center gap-3 rounded-xl bg-[#FEE500] px-4 py-3.5">
            <span className="text-xl">💬</span>
            <div>
              <p className="text-[13px] font-bold">카카오톡 오픈채팅</p>
              <p className="text-[11px] text-neutral-600">
                가장 활발한 소통 채널
              </p>
            </div>
          </div>

          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800">
            🔑{" "}
            <strong className="text-amber-900">
              가입 완료 시 오픈채팅 링크와 비밀번호가 안내됩니다.
            </strong>
          </div>

          <a
            href="https://www.instagram.com/team_gigang"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex items-center gap-3 rounded-xl bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045] px-4 py-3.5 text-white"
          >
            <span className="text-xl">📸</span>
            <div>
              <p className="text-[13px] font-bold">인스타그램</p>
              <p className="text-[11px] text-white/85">@team_gigang</p>
            </div>
          </a>
        </section>

        {/* 5. 문의 */}
        <section className="mx-4 mt-3 rounded-2xl border border-border bg-white p-6">
          <h2 className="text-sm font-bold">📞 문의</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            카카오톡 ID: <strong className="text-foreground">winsu</strong>
            <br />
            링크가 열리지 않으면 카카오톡으로 연락 바랍니다.
          </p>
        </section>

        {/* 6. 하단 고정 CTA */}
        <div className="fixed inset-x-0 bottom-0 z-50 bg-gradient-to-t from-white via-white/90 to-transparent px-4 pb-4 pt-6">
          <div className="mx-auto max-w-xl">
            <Link
              href="/auth/login?next=%2Fnewbie"
              className="block rounded-2xl bg-blue-600 py-4 text-center text-base font-bold text-white shadow-[0_4px_16px_rgba(37,99,235,0.3)]"
            >
              가입하기 →
            </Link>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              카카오 또는 구글로 간편 가입
            </p>
          </div>
        </div>
      </div>
    </InAppBrowserGate>
  );
}
