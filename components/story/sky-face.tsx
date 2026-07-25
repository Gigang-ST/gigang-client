import { Send } from "lucide-react";

import { cn } from "@/lib/utils";

import { Avatar } from "@/components/common/avatar";

/**
 * 하늘을 나는 얼굴 — 한마디를 날린 사람 본인이 배너를 끌고 지면을 가로지른다.
 *
 * 원래는 종이비행기 그림(`public/story/paper-plane.png`)이 배너를 끌었다. 비행기에
 * 얼굴을 얹거나 접힌 면에 사진을 넣는 방식을 여럿 그려 봤지만 다 별로였다 —
 * 손그림 날개가 5:1로 납작해 얼굴이 가로 띠로 잘리고, 원형 아바타를 위에 올리면
 * 그림 위에 스티커를 붙인 것처럼 겉돌았다. **비행기를 지우고 얼굴만 날린다.**
 *
 * 그래서 이 컴포넌트에 그림은 없다. 날아가는 건 사람이고, 크루원은 서로 얼굴을 아니까
 * 배너의 이름보다 얼굴이 먼저 읽힌다(글자는 지나가지만 얼굴은 한눈에 들어온다).
 *
 * 비행 애니메이션의 `transform`은 **바깥 요소**에 걸어 이 컴포넌트의 것과 겹치지 않게
 * 한다(globals.css의 `.pledge-fly` 참고).
 */
export function SkyFace({
  className,
  rider,
  size = "sm",
}: {
  className?: string;
  /** 한마디를 날린 사람 */
  rider: { memId: string; memNm: string; avatarUrl: string | null };
  /** 얼굴 크기 — 하늘에선 `md`(40px), 좁은 자리는 `sm` */
  size?: "sm" | "md";
}) {
  return (
    <Avatar
      src={rider.avatarUrl}
      seed={rider.memId}
      alt={rider.memNm}
      size={size}
      // 하늘에 떠 있는 얼굴이라 배경과 닿는 테두리를 한 겹 둘러 윤곽을 세운다 —
      // 배너·본문 위를 지날 때 얼굴이 지면에 묻히지 않게.
      className={cn("shrink-0 ring-2 ring-background", className)}
    />
  );
}

/**
 * 전송 버튼 아이콘 — "날린다"는 동작을 나타내는 종이비행기 모양 아이콘.
 *
 * 하늘을 나는 건 사람 얼굴이지만, 버튼에까지 내 얼굴을 넣을 수는 없다(아직 날리지
 * 않았고, 버튼은 동작을 가리켜야 한다). lucide의 `Send`가 종이비행기 모양이라
 * "날리기"가 그대로 읽힌다.
 */
export function SendIcon({ className }: { className?: string }) {
  return <Send aria-hidden className={cn("size-5", className)} />;
}
