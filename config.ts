type SiteContent = {
  metadata: {
    title: string;
    description: string;
  };
  brand: {
    shortName: string;
    fullName: string;
  };
};

export const siteContent: SiteContent = {
  metadata: {
    title: "기강",
    description:
      "운동을 좋아하는 사람들이 모여 만든 스포츠 팀. 러닝, 자전거, 수영, 여행을 함께합니다.",
  },
  brand: {
    shortName: "기강",
    fullName: "기강",
  },
};
