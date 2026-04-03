import type { Meta, StoryObj } from "@storybook/nextjs-vite";

type ColorSwatchProps = {
  label: string;
  variable: string;
  className: string;
  textClassName?: string;
};

function ColorSwatch({
  label,
  variable,
  className,
  textClassName = "text-foreground",
}: ColorSwatchProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-10 w-10 shrink-0 rounded-md border border-border ${className}`}
      />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${textClassName}`}>{label}</p>
        <p className="text-xs text-muted-foreground">{variable}</p>
      </div>
    </div>
  );
}

function ColorGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  );
}

function ColorTokensPage() {
  return (
    <div className="w-[720px] space-y-8 p-6 bg-background text-foreground">
      <div>
        <h1 className="text-2xl font-bold font-[family-name:var(--font-nanumMyeongjo)]">
          기강 Color Tokens
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          프로젝트 전체에서 사용되는 색상 토큰 시스템
        </p>
      </div>

      {/* 이벤트 타입(거리) 색상 */}
      <ColorGroup title="이벤트 타입 (Event Type)">
        <ColorSwatch
          label="FULL (풀마라톤)"
          variable="--event-full"
          className="bg-[hsl(var(--event-full))]"
        />
        <ColorSwatch
          label="HALF (하프마라톤)"
          variable="--event-half"
          className="bg-[hsl(var(--event-half))]"
        />
        <ColorSwatch
          label="10K"
          variable="--event-10k"
          className="bg-[hsl(var(--event-10k))]"
        />
      </ColorGroup>

      {/* 종목별 색상 (= 차트 색상) */}
      <ColorGroup title="종목 / 차트 (Sport / Chart)">
        <ColorSwatch
          label="로드 러닝"
          variable="bg-sport-road-run (= chart-1)"
          className="bg-sport-road-run"
        />
        <ColorSwatch
          label="울트라마라톤"
          variable="bg-sport-ultra (= chart-5)"
          className="bg-sport-ultra"
        />
        <ColorSwatch
          label="트레일 러닝"
          variable="bg-sport-trail-run (= chart-4)"
          className="bg-sport-trail-run"
        />
        <ColorSwatch
          label="철인3종"
          variable="bg-sport-triathlon (= chart-2)"
          className="bg-sport-triathlon"
        />
        <ColorSwatch
          label="사이클"
          variable="bg-sport-cycling (= chart-3)"
          className="bg-sport-cycling"
        />
      </ColorGroup>

      {/* 상태 색상 */}
      <ColorGroup title="상태 (Status)">
        <ColorSwatch
          label="Destructive"
          variable="bg-destructive"
          className="bg-destructive"
        />
        <ColorSwatch
          label="Destructive Foreground"
          variable="bg-destructive-foreground"
          className="bg-destructive-foreground"
        />
        <ColorSwatch
          label="Success"
          variable="bg-success"
          className="bg-success"
        />
        <ColorSwatch
          label="Success Foreground"
          variable="bg-success-foreground"
          className="bg-success-foreground"
        />
        <ColorSwatch
          label="Warning"
          variable="bg-warning"
          className="bg-warning"
        />
        <ColorSwatch
          label="Warning Foreground"
          variable="bg-warning-foreground"
          className="bg-warning-foreground"
        />
        <ColorSwatch
          label="Info"
          variable="bg-info"
          className="bg-info"
        />
        <ColorSwatch
          label="Info Foreground"
          variable="bg-info-foreground"
          className="bg-info-foreground"
        />
      </ColorGroup>

      {/* 유틸리티 */}
      <ColorGroup title="유틸리티 (Utility)">
        <ColorSwatch
          label="Border"
          variable="bg-border"
          className="bg-border"
        />
        <ColorSwatch
          label="Input"
          variable="bg-input"
          className="bg-input"
        />
        <ColorSwatch
          label="Ring"
          variable="bg-ring"
          className="bg-ring"
        />
      </ColorGroup>

      {/* 주요 색상 */}
      <ColorGroup title="주요 (Primary / Secondary)">
        <ColorSwatch
          label="Primary"
          variable="bg-primary"
          className="bg-primary"
        />
        <ColorSwatch
          label="Primary Foreground"
          variable="bg-primary-foreground"
          className="bg-primary-foreground"
        />
        <ColorSwatch
          label="Secondary"
          variable="bg-secondary"
          className="bg-secondary"
        />
        <ColorSwatch
          label="Secondary Foreground"
          variable="bg-secondary-foreground"
          className="bg-secondary-foreground"
        />
        <ColorSwatch
          label="Accent"
          variable="bg-accent"
          className="bg-accent"
        />
        <ColorSwatch
          label="Accent Foreground"
          variable="bg-accent-foreground"
          className="bg-accent-foreground"
        />
        <ColorSwatch
          label="Muted"
          variable="bg-muted"
          className="bg-muted"
        />
        <ColorSwatch
          label="Muted Foreground"
          variable="bg-muted-foreground"
          className="bg-muted-foreground"
        />
      </ColorGroup>

      {/* 기본 색상 */}
      <ColorGroup title="기본 (Base)">
        <ColorSwatch
          label="Background"
          variable="bg-background"
          className="bg-background"
        />
        <ColorSwatch
          label="Foreground"
          variable="bg-foreground"
          className="bg-foreground"
        />
        <ColorSwatch
          label="Card"
          variable="bg-card"
          className="bg-card"
        />
        <ColorSwatch
          label="Card Foreground"
          variable="bg-card-foreground"
          className="bg-card-foreground"
        />
        <ColorSwatch
          label="Popover"
          variable="bg-popover"
          className="bg-popover"
        />
        <ColorSwatch
          label="Popover Foreground"
          variable="bg-popover-foreground"
          className="bg-popover-foreground"
        />
      </ColorGroup>

      {/* 사용 예시 */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">
          사용 예시
        </h3>
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold bg-sport-road-run text-foreground">
              로드 러닝
            </span>
            <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold bg-sport-ultra text-foreground">
              울트라마라톤
            </span>
            <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold bg-sport-trail-run text-foreground">
              트레일 러닝
            </span>
            <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold bg-sport-triathlon text-foreground">
              철인3종
            </span>
            <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold bg-sport-cycling text-white">
              사이클
            </span>
          </div>

          <div className="flex gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-success/10 text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              완주
            </span>
            <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-warning/10 text-warning">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              진행중
            </span>
            <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              DNF
            </span>
            <span className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium bg-info/10 text-info">
              <span className="h-1.5 w-1.5 rounded-full bg-info" />
              예정
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: "Design Tokens/Colors",
  component: ColorTokensPage,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof ColorTokensPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
