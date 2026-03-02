import localFont from "next/font/local"

export const NanumMyeongjo = localFont({
  src: [
    {
      path: "../app/fonts/nanum-myeongjo/NanumMyeongjo-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../app/fonts/nanum-myeongjo/NanumMyeongjo-Bold.ttf",
      weight: "700",
      style: "normal",
    },
    {
      path: "../app/fonts/nanum-myeongjo/NanumMyeongjo-ExtraBold.ttf",
      weight: "800",
      style: "normal",
    },
  ],
  display: "swap",
})

export const pretendard = localFont({
  src: [
    {
      path: "../app/fonts/pretendard/PretendardVariable.woff2",
      weight: "100 900",
      style: "normal",
    },
  ],
  display: "swap",
})
