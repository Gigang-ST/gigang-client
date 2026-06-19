"use client";
// 이 파일은 반드시 dynamic(() => import(...), { ssr: false })로만 로드해야 합니다.
// 직접 import하면 CSS가 초기 번들에 포함되어 refractor(876KB)가 다시 끌려옵니다.
import "@uiw/react-md-editor/markdown-editor.css";
export { default } from "@uiw/react-md-editor/nohighlight";
