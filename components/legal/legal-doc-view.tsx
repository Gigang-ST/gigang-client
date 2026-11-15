import type { LegalDoc } from "@/lib/legal-docs";

/** 약관 3종 공통 지면 — 제목·시행일·조항·변경 이력(본문은 `lib/legal-docs.ts`가 팀별로 만든다) */
export function LegalDocView({ doc }: { doc: LegalDoc }) {
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 pb-16 pt-4">
      <h1 className="text-3xl font-bold md:text-4xl">{doc.heading}</h1>
      <p className="mt-3 text-sm text-muted-foreground">시행일: {doc.effectiveDate}</p>

      <ol className="mt-8 space-y-8 text-muted-foreground">
        {doc.sections.map((section) => (
          <li key={section.id} className="space-y-3">
            <h2 className="text-lg font-semibold md:text-xl">
              {section.id}. {section.title}
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
              {section.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <div className="mt-10 space-y-1 text-sm text-muted-foreground">
        <p className="font-semibold">변경 이력</p>
        {doc.history.map((h) => (
          <p key={h}>{h}</p>
        ))}
      </div>
    </div>
  );
}
