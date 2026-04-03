import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";

import { SegmentControl } from "@/components/common/segment-control";

const meta = {
  title: "Common/SegmentControl",
  component: SegmentControl,
  args: {
    segments: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
    value: "a",
    onValueChange: () => {},
  },
} satisfies Meta<typeof SegmentControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoSegments: Story = {
  render: () => {
    const [value, setValue] = useState("gigang");
    return (
      <div className="w-64">
        <SegmentControl
          segments={[
            { value: "gigang", label: "기강 대회" },
            { value: "all", label: "전체 대회" },
          ]}
          value={value}
          onValueChange={setValue}
        />
      </div>
    );
  },
};

export const FourSegments: Story = {
  render: () => {
    const [value, setValue] = useState("all");
    return (
      <div className="w-80">
        <SegmentControl
          segments={[
            { value: "all", label: "전체" },
            { value: "active", label: "활동" },
            { value: "inactive", label: "비활성" },
            { value: "pending", label: "대기" },
          ]}
          value={value}
          onValueChange={setValue}
        />
      </div>
    );
  },
};
