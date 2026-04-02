import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { H1, H2, Body, Caption, Micro, SectionLabel } from "@/components/common/typography";

function TypographyShowcase() {
  return (
    <div className="w-[480px] space-y-6 bg-background p-6 text-foreground">
      <div>
        <h1 className="text-2xl font-bold">Typography</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          프로젝트 전체에서 사용되는 타이포그래피 컴포넌트
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1 border-b border-border pb-4">
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
            {"<H1>"} — 28px bold
          </code>
          <H1>기강</H1>
        </div>

        <div className="flex flex-col gap-1 border-b border-border pb-4">
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
            {"<H2>"} — 22px bold
          </code>
          <H2>회원 관리</H2>
        </div>

        <div className="flex flex-col gap-1 border-b border-border pb-4">
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
            {"<Body>"} — 15px
          </code>
          <Body>홍길동</Body>
          <Body className="font-semibold">홍길동 (semibold)</Body>
        </div>

        <div className="flex flex-col gap-1 border-b border-border pb-4">
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
            {"<Caption>"} — 13px muted
          </code>
          <Caption>서울 · 2026년 4월 12일</Caption>
        </div>

        <div className="flex flex-col gap-1 border-b border-border pb-4">
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
            {"<Micro>"} — 11px muted
          </code>
          <Micro>D-7</Micro>
        </div>

        <div className="flex flex-col gap-1">
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs">
            {"<SectionLabel>"} — 12px semibold tracking-widest muted
          </code>
          <SectionLabel>TEAM OVERVIEW</SectionLabel>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Design Tokens/Typography",
  component: TypographyShowcase,
  parameters: { layout: "centered" },
} satisfies Meta<typeof TypographyShowcase>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
