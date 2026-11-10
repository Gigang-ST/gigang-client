import { buildTeamCopy } from "@/lib/team-copy";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SocialLinksRow, SocialLinksGrid } from "@/components/social-links";
import type { TeamChannels } from "@/lib/team-channels";

/** 스토리는 기강 팀 문구로 그린다(§lib/team-copy) */
const COPY = buildTeamCopy({ teamCd: "gigang", crewName: "기강", memberNoun: "기강인", wordmark: "GIGANG" });

/** 스토리용 예시 채널(실제 값은 팀 설정에서 온다) */
const CHANNELS: TeamChannels = {
  kakao_open_chat: "https://open.kakao.com/o/example",
  instagram: "https://www.instagram.com/example",
  somoim: "https://www.somoim.co.kr/example",
  garmin: "https://connect.garmin.com/app/group/0",
};

const meta = {
  title: "Common/SocialLinks",
  component: SocialLinksGrid,
  parameters: { layout: "centered" },
  args: { channels: CHANNELS, copy: COPY },
} satisfies Meta<typeof SocialLinksGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  render: () => (
    <div className="w-[375px] p-6">
      <SocialLinksGrid channels={CHANNELS} copy={COPY} />
    </div>
  ),
};

export const GridWithPassword: Story = {
  render: () => (
    <div className="w-[375px] p-6">
      {/* kakaoChatPassword prop이 서버 액션으로 전환됨 — 스토리에서는 prop 없이 렌더 */}
      <SocialLinksGrid channels={CHANNELS} copy={COPY} />
    </div>
  ),
};

export const Row: Story = {
  render: () => (
    <div className="w-[375px] p-6 flex justify-center">
      <SocialLinksRow channels={CHANNELS} />
    </div>
  ),
};
