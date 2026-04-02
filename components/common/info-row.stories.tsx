import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { InfoRow } from "@/components/common/info-row";

const meta = {
  title: "Common/InfoRow",
  component: InfoRow,
} satisfies Meta<typeof InfoRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "이메일",
    value: "runner@gigang.kr",
  },
};

export const WithNullValue: Story = {
  args: {
    label: "계좌번호",
    value: undefined,
  },
};

export const Multiple: Story = {
  args: { label: "이름", value: "홍길동" },
  render: () => (
    <div className="w-80">
      <InfoRow label="이름" value="홍길동" />
      <InfoRow label="이메일" value="runner@gigang.kr" />
      <InfoRow label="연락처" value="010-1234-5678" />
      <InfoRow label="은행" value="카카오뱅크" />
      <InfoRow label="계좌번호" />
    </div>
  ),
};
