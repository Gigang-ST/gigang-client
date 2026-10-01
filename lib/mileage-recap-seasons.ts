// lib/mileage-recap-seasons.ts — 시즌별 돌아보기 덧붙임(회식 모임·단체사진)
//
// 통계는 데이터에서 저절로 나오지만, "이번 시즌 회식은 이 모임"·"이 사진이 우리 단체사진"은
// 사람이 정하는 거라 시즌 id별로 여기 한 줄씩 적는다. 시즌이 끝날 때 운영진 요청으로 추가한다.
//
// 모임은 **id만** 적는다 — 이름·시간·장소는 돌아보기 페이지가 실제 모임에서 읽어 온다
// (장소가 바뀌어도 여기를 고칠 일이 없다). 회식 시간이 지나면 초대 문구는 저절로 내려간다.

export type RecapSeasonExtras = {
  /** 시즌 마무리 회식 모임(`gthr_mst.gthr_id`) — 맨 끝 초대 문구가 이 모임으로 딥링크한다 */
  partyGthrId?: string;
  /**
   * 마무리 인사 위에 거는 단체사진들 — 시즌 동안 올라온 사진(`post-photos`) 중에서 고른다.
   * 작게 세 장까지 나란히(폴라로이드처럼 살짝씩 기울여) 건다.
   */
  groupPhotoUrls?: string[];
  /**
   * 여러 번 뛴 걸 귀찮아서 한 번에 몰아 올린 기록(`evt_mlg_act_hist.act_id`). 실제로 뛴 거리라
   * 합계·출석엔 그대로 두고, **"한 번에 뛴 거리"를 보는 곳**(장거리왕·나의 시즌 '한 번에 제일 멀리
   * 간 날')에서만 뺀다 — 그대로 두면 몰아 올린 사람이 장거리왕이 된다(시즌4에서 실제로 그랬다).
   */
  bulkActIds?: string[];
};

export const RECAP_SEASON_EXTRAS: Record<string, RecapSeasonExtras> = {
  // 26 마일리지런 시즌4 — 회식 10/11(일) 17:00 신논현 영동그집
  "a76f9d78-cd39-4ad9-93e2-f86b25aac8eb": {
    partyGthrId: "f914f1b9-2a1d-4954-bbc5-bd0af82e25db",
    // 크루가 고른 단체사진 셋 — 8/5 김남현 · 8/8 임수빈 · 8/16 김대윤(울주 투 피크)
    // 주찬욱 9/19 러닝 63km — 여러 번 뛴 걸 한 번에 올린 기록(본인 확인)
    bulkActIds: ["84cc123c-92ad-498d-9007-e1eaaaf4c22c"],
    groupPhotoUrls: [
      "https://zzeoqaxekgfstjrpafud.supabase.co/storage/v1/object/public/post-photos/7c15eac8-f64f-4a31-865d-6468f6115c0c/1785936999457-i7g6ka.jpg",
      "https://zzeoqaxekgfstjrpafud.supabase.co/storage/v1/object/public/post-photos/4c6520d6-0ae9-4b29-a812-b240b88c7f8d/1786149864547-44wh1g.jpg",
      "https://zzeoqaxekgfstjrpafud.supabase.co/storage/v1/object/public/post-photos/8bf69b06-da38-4b6b-8a50-ca9a6958b7bc/1786866210040-5b82e2.jpg",
    ],
  },
};

/** 회식 초대에 쓰는 모임 정보 — 실제 모임에서 읽은 값 */
export type RecapParty = {
  gthr_id: string;
  gthr_nm: string;
  /** timestamptz */
  stt_at: string;
  loc_txt: string | null;
};
