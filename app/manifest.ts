import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "기강",
    short_name: "기강",
    description:
      "운동을 좋아하는 사람들이 모여 만든 스포츠 팀. 러닝, 자전거, 수영, 여행을 함께합니다.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      { src: "/android-icon-72x72.png", sizes: "72x72", type: "image/png" },
      { src: "/android-icon-96x96.png", sizes: "96x96", type: "image/png" },
      { src: "/android-icon-144x144.png", sizes: "144x144", type: "image/png" },
      {
        src: "/android-icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
