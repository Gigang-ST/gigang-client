type SiteContent = {
  metadata: {
    title: string;
    searchTitle: string;
    titleTemplate: string;
    description: string;
  };
  brand: {
    shortName: string;
    fullName: string;
  };
};

/** 정규 도메인. 사이트맵·robots·canonical이 모두 이 값을 기준으로 절대 URL을 만든다. */
export const SITE_URL = "https://gigang.team";

export const siteContent: SiteContent = {
  metadata: {
    /** 앱 안에서 쓰는 짧은 이름 — PWA 설치명·상단 표시용. */
    title: "기강",
    /**
     * 검색결과에 뜨는 홈 제목.
     *
     * "기강" 단독으로는 검색이 안 된다 — 동음이의어라 "팀 기강", "대표팀 기강 확립"
     * 같은 스포츠 뉴스에 통째로 묻힌다(2026-09-01 네이버 `기강스포츠팀` 실검색 확인).
     * 사람들이 실제로 치는 말("러닝크루", 활동 지역)을 제목에 넣어야 걸린다.
     */
    searchTitle: "기강 러닝크루 | 양재천·강남 러닝 스포츠팀",
    /** 하위 지면 제목. 지면마다 다른 제목이 있어야 검색결과에서 서로 구분된다. */
    titleTemplate: "%s | 기강 러닝크루",
    description:
      "양재천·강남에서 함께 달리는 러닝크루 기강. 운동을 좋아하는 사람들이 모여 만든 스포츠 팀으로 러닝, 자전거, 수영, 여행을 함께합니다.",
  },
  brand: {
    shortName: "기강",
    fullName: "기강",
  },
};
