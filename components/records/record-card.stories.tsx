import type { MemberCardData } from "@/lib/member-card";

import { RecordCard } from "./record-card";

import type { Meta, StoryObj } from "@storybook/nextjs-vite";


const base: MemberCardData = {
  mem_nm: "김기강",
  avatar_url: null,
  badge_effect: "gold",
  frame_cd: "frame-gold",
  card_featured: null,
  primary_title: { ttl_nm: "새벽의 페이서", ttl_desc: null, desc_visibility: "others" },
  best_records: [
    { sport: "road_run", evt: "FULL", rec_time_sec: 12258, race_nm: "JTBC 서울마라톤", race_dt: "2026-03-01" },
    { sport: "road_run", evt: "10K", rec_time_sec: 2550, race_nm: "기강 정기런", race_dt: "2026-04-12" },
    { sport: "trail_run", evt: "50K", rec_time_sec: 22360, race_nm: "코리아 50K", race_dt: "2025-10-05" },
  ],
  utmb_index: 642,
};

const meta: Meta<typeof RecordCard> = {
  title: "records/RecordCard",
  component: RecordCard,
};
export default meta;
type Story = StoryObj<typeof RecordCard>;

export const Default: Story = { args: { data: base } };
export const NoRecords: Story = { args: { data: { ...base, best_records: [], card_featured: null } } };
export const NoTitle: Story = { args: { data: { ...base, primary_title: null, frame_cd: "frame-none", badge_effect: "none" } } };
export const Featured: Story = {
  args: { data: { ...base, card_featured: [{ sport: "trail_run", evt: "50K" }, { sport: "road_run", evt: "FULL" }] } },
};
