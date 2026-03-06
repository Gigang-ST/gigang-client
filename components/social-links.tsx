import Image from "next/image";

const SOCIAL_LINKS = [
  {
    key: "kakao",
    label: "오픈채팅",
    href: "https://open.kakao.com/o/grnMFGng",
    logo: "/kakao.png",
  },
  {
    key: "instagram",
    label: "인스타",
    href: "https://www.instagram.com/team_gigang",
    logo: "/Instagram.png",
  },
  {
    key: "somoim",
    label: "소모임",
    href: "https://www.somoim.co.kr/3beed52a-0620-11ef-a71d-0aebcbdc4a071",
    logo: "/somoim.png",
  },
  {
    key: "garmin",
    label: "가민",
    href: "https://connect.garmin.com/app/group/4857390",
    logo: "/garmin.png",
  },
] as const;

export function SocialLinksRow() {
  return (
    <div className="flex items-center justify-center gap-5">
      {SOCIAL_LINKS.map(({ key, label, href, logo }) => (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1"
        >
          <Image src={logo} alt={label} width={32} height={32} />
          <span className="text-[10px] font-medium text-muted-foreground">
            {label}
          </span>
        </a>
      ))}
    </div>
  );
}

export function SocialLinksGrid() {
  return (
    <div className="flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-widest text-muted-foreground">
        SOCIAL
      </span>
      <div className="grid grid-cols-4 gap-2.5">
        {SOCIAL_LINKS.map(({ key, label, href, logo }) => (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-border py-3"
          >
            <Image src={logo} alt={label} width={28} height={28} />
            <span className="text-xs font-semibold text-foreground">
              {label}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
