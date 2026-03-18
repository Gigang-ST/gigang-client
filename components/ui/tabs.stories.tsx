import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const meta = {
  title: "ui/Tabs",
  component: Tabs,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="running" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="running">러닝</TabsTrigger>
        <TabsTrigger value="cycling">자전거</TabsTrigger>
        <TabsTrigger value="swimming">수영</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
};

export const Line: Story = {
  render: () => (
    <Tabs defaultValue="upcoming" className="w-[400px]">
      <TabsList variant="line">
        <TabsTrigger value="upcoming">예정 대회</TabsTrigger>
        <TabsTrigger value="past">지난 대회</TabsTrigger>
        <TabsTrigger value="my">내 대회</TabsTrigger>
      </TabsList>
    </Tabs>
  ),
};

export const WithContent: Story = {
  render: () => (
    <Tabs defaultValue="running" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="running">러닝</TabsTrigger>
        <TabsTrigger value="cycling">자전거</TabsTrigger>
        <TabsTrigger value="swimming">수영</TabsTrigger>
      </TabsList>
      <TabsContent value="running">
        <div className="rounded-lg border p-4">
          <h3 className="mb-2 font-semibold">러닝 기록</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>풀코스 최고 기록: 3:28:15</li>
            <li>하프 최고 기록: 1:35:42</li>
            <li>10km 최고 기록: 42:18</li>
          </ul>
        </div>
      </TabsContent>
      <TabsContent value="cycling">
        <div className="rounded-lg border p-4">
          <h3 className="mb-2 font-semibold">자전거 기록</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>100km 최고 기록: 3:12:30</li>
            <li>그란폰도 완주: 2회</li>
          </ul>
        </div>
      </TabsContent>
      <TabsContent value="swimming">
        <div className="rounded-lg border p-4">
          <h3 className="mb-2 font-semibold">수영 기록</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>1.5km 최고 기록: 28:45</li>
            <li>오픈워터 완주: 1회</li>
          </ul>
        </div>
      </TabsContent>
    </Tabs>
  ),
};
