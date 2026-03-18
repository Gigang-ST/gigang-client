import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";

const meta = {
  title: "ui/Select",
  component: Select,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="종목 선택" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="running">러닝</SelectItem>
        <SelectItem value="cycling">자전거</SelectItem>
        <SelectItem value="swimming">수영</SelectItem>
        <SelectItem value="trail">트레일러닝</SelectItem>
        <SelectItem value="triathlon">트라이애슬론</SelectItem>
      </SelectContent>
    </Select>
  ),
};

export const WithGroups: Story = {
  render: () => (
    <Select>
      <SelectTrigger className="w-[240px]">
        <SelectValue placeholder="대회 거리 선택" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>러닝</SelectLabel>
          <SelectItem value="5k">5km</SelectItem>
          <SelectItem value="10k">10km</SelectItem>
          <SelectItem value="half">하프 마라톤 (21.0975km)</SelectItem>
          <SelectItem value="full">풀 마라톤 (42.195km)</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>자전거</SelectLabel>
          <SelectItem value="cycle-40">40km</SelectItem>
          <SelectItem value="cycle-100">100km</SelectItem>
          <SelectItem value="cycle-200">200km</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>트라이애슬론</SelectLabel>
          <SelectItem value="sprint">스프린트</SelectItem>
          <SelectItem value="olympic">올림픽</SelectItem>
          <SelectItem value="half-ironman">하프 아이언맨</SelectItem>
          <SelectItem value="ironman">아이언맨</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Select disabled>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="종목 선택" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="running">러닝</SelectItem>
        <SelectItem value="cycling">자전거</SelectItem>
        <SelectItem value="swimming">수영</SelectItem>
      </SelectContent>
    </Select>
  ),
};
