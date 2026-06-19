// 마크다운 에디터 lazy 로더 — CSS와 JS를 함께 동적 임포트하여
// homepage 초기 번들에서 refractor(876KB)가 포함되지 않도록 분리
import "@uiw/react-md-editor/markdown-editor.css";
export { default } from "@uiw/react-md-editor/nohighlight";
