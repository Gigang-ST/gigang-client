import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import {
  User,
  Settings,
  LogOut,
  ChevronDown,
  Bike,
  Footprints,
  Waves,
  Mountain,
  Trophy,
  Calendar,
  BarChart3,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const meta = {
  title: "ui/DropdownMenu",
  component: DropdownMenu,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          내 메뉴
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>내 계정</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <User />
          프로필
          <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings />
          설정
          <DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const WithCheckbox: Story = {
  render: function Render() {
    const [showRunning, setShowRunning] = useState(true);
    const [showCycling, setShowCycling] = useState(false);
    const [showSwimming, setShowSwimming] = useState(true);
    const [showTrail, setShowTrail] = useState(false);

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">종목 필터</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuLabel>표시할 종목</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showRunning}
            onCheckedChange={setShowRunning}
          >
            러닝
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showCycling}
            onCheckedChange={setShowCycling}
          >
            자전거
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showSwimming}
            onCheckedChange={setShowSwimming}
          >
            수영
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showTrail}
            onCheckedChange={setShowTrail}
          >
            트레일러닝
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

export const WithRadio: Story = {
  render: function Render() {
    const [sport, setSport] = useState("running");

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">종목 선택</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuLabel>주 종목</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={sport} onValueChange={setSport}>
            <DropdownMenuRadioItem value="running">
              러닝
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="cycling">
              자전거
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="swimming">
              수영
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="trail">
              트레일러닝
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="triathlon">
              트라이애슬론
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

export const WithSubmenu: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          기강 메뉴
          <ChevronDown className="ml-2 size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-52">
        <DropdownMenuLabel>기강 팀</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Trophy />
          대회 목록
        </DropdownMenuItem>
        <DropdownMenuItem>
          <BarChart3 />
          내 기록
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Calendar />
          일정
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Footprints />
            종목별 보기
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>
              <Footprints />
              러닝
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Bike />
              자전거
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Waves />
              수영
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Mountain />
              트레일러닝
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Settings />
          설정
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};
