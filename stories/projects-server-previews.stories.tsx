/**
 * Projects 서버 컴포넌트 UI 프리뷰
 * RefundStatus, RandomReview, MyStatus는 서버 컴포넌트라 Storybook에서 직접 렌더 불가.
 * 동일한 UI 구조를 목 데이터로 미리보기.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StatCard } from "@/components/common/stat-card";
import { CardItem } from "@/components/ui/card";
import { Body, Caption } from "@/components/common/typography";

// ── RefundStatus ──────────────────────────────────────────

function RefundStatusPreview({
  myRefund,
  myPartyBudget,
}: {
  myRefund: number;
  myPartyBudget: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard value={`₩${myRefund.toLocaleString()}`} label="환급 예정금" />
      <StatCard value={`₩${myPartyBudget.toLocaleString()}`} label="회식비 지원금(예상)" />
    </div>
  );
}

// ── RandomReview ──────────────────────────────────────────

const mockReviews = [
  { id: "1", name: "홍길동", sport: "러닝", km: 10.5, review: "오늘도 잘 달렸다! 날씨가 너무 좋았어요" },
  { id: "2", name: "김영희", sport: "트레일러닝", km: 15.2, review: "산에서 뛰는 건 역시 최고야" },
  { id: "3", name: "이철수", sport: "사이클", km: 40, review: "한강 라이딩 완료" },
];

function RandomReviewPreview() {
  return (
    <div className="flex flex-col gap-2">
      {mockReviews.map((item) => (
        <div key={item.id} className="rounded-2xl bg-muted px-4 py-3">
          <Caption className="font-semibold text-foreground">{item.name}</Caption>
          <Caption className="text-muted-foreground">
            {" : "}
            {item.review}
            {" / "}
            {item.sport} {item.km}km
          </Caption>
        </div>
      ))}
    </div>
  );
}

// ── MyStatus ──────────────────────────────────────────────

function MyStatusPreview({
  goalKm,
  currentMileage,
  paceRatio,
  dailyNeeded,
}: {
  goalKm: number;
  currentMileage: number;
  paceRatio: number;
  dailyNeeded: number | "done";
}) {
  const progressPct = goalKm > 0 ? Math.min((currentMileage / goalKm) * 100, 100) : 0;
  const isPaceAhead = paceRatio >= 1.0;

  return (
    <CardItem className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col gap-0.5">
          <Caption>당월 목표</Caption>
          <Body className="font-semibold">{goalKm.toFixed(0)} km</Body>
        </div>
        <div className="flex flex-col gap-0.5">
          <Caption>현재</Caption>
          <Body className="font-semibold">{currentMileage.toFixed(1)} km</Body>
        </div>
        <div className="flex flex-col gap-0.5">
          <Caption>진행률</Caption>
          <Body className="font-semibold">{progressPct.toFixed(1)}%</Body>
        </div>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Caption>기간 대비</Caption>
          <Caption
            className={isPaceAhead ? "text-success font-semibold" : "text-destructive font-semibold"}
          >
            {(paceRatio * 100).toFixed(0)}%
          </Caption>
        </div>
        <div>
          {dailyNeeded === "done" ? (
            <Caption className="text-success font-semibold">달성 완료!</Caption>
          ) : (
            <Caption>
              일일 필요{" "}
              <span className="font-semibold text-foreground">
                {(dailyNeeded as number).toFixed(1)} km
              </span>
            </Caption>
          )}
        </div>
      </div>
    </CardItem>
  );
}

// ── Storybook meta ────────────────────────────────────────

const meta = {
  title: "Projects/ServerPreviews",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RefundStatus: Story = {
  render: () => (
    <div className="w-[375px] p-4 flex flex-col gap-6">
      <div>
        <p className="text-xs text-muted-foreground mb-2">RefundStatus — 정상 케이스</p>
        <RefundStatusPreview myRefund={45000} myPartyBudget={38000} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-2">RefundStatus — 목표 미달</p>
        <RefundStatusPreview myRefund={0} myPartyBudget={12000} />
      </div>
    </div>
  ),
};

export const RandomReview: Story = {
  render: () => (
    <div className="w-[375px] p-4">
      <p className="text-xs text-muted-foreground mb-2">RandomReview — 최근 7일 후기</p>
      <RandomReviewPreview />
    </div>
  ),
};

export const MyStatusOnTrack: Story = {
  render: () => (
    <div className="w-[375px] p-4">
      <p className="text-xs text-muted-foreground mb-2">MyStatus — 페이스 정상</p>
      <MyStatusPreview goalKm={100} currentMileage={62} paceRatio={1.08} dailyNeeded={3.2} />
    </div>
  ),
};

export const MyStatusBehind: Story = {
  render: () => (
    <div className="w-[375px] p-4">
      <p className="text-xs text-muted-foreground mb-2">MyStatus — 페이스 뒤처짐</p>
      <MyStatusPreview goalKm={100} currentMileage={28} paceRatio={0.65} dailyNeeded={5.8} />
    </div>
  ),
};

export const MyStatusCompleted: Story = {
  render: () => (
    <div className="w-[375px] p-4">
      <p className="text-xs text-muted-foreground mb-2">MyStatus — 달성 완료</p>
      <MyStatusPreview goalKm={100} currentMileage={100} paceRatio={1.35} dailyNeeded="done" />
    </div>
  ),
};
