import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import remarkSoftBreaks from "@/lib/markdown/remark-soft-breaks";

/**
 * 팀 설정에 마크다운으로 쓴 안내 본문(신입 안내 「더 알아보기」 칸 — §lib/newbie-guide)을 그린다.
 *
 * 모양은 예전에 손으로 짠 기강 안내와 같게 맞춘다 — 13px 회색 본문, 굵게는 진한 글씨, 소제목은 굵은 13px, 표는 테두리 11px.
 * 게시판(`prose`)과 다른 이유: 이건 접어 보는 작은 칸이라 게시글 서체 크기면 칸이 터진다.
 * 엔터 한 번이 그대로 줄바꿈이다(remark-soft-breaks). 물결 하나(「60~70%」)는 취소선으로 보지 않는다(`singleTilde: false`). HTML 은 그리지 않고(react-markdown 기본), 위험한 링크 주소는 걸러진다.
 * 상태가 없어 서버에서 그린다 — 방문자 쪽으로 마크다운 라이브러리를 보내지 않는다.
 */
const components: Components = {
  h1: ({ children }) => <p className="mb-1.5 mt-4 text-[13px] font-bold text-foreground first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mb-1.5 mt-4 text-[13px] font-bold text-foreground first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mb-1.5 mt-4 text-[13px] font-bold text-foreground first:mt-0">{children}</p>,
  h4: ({ children }) => <p className="mb-1.5 mt-4 text-[13px] font-bold text-foreground first:mt-0">{children}</p>,
  p: ({ children }) => <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-4 text-[13px] text-muted-foreground last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-4 text-[13px] text-muted-foreground last:mb-0">{children}</ol>
  ),
  strong: ({ children }) => <span className="font-bold text-foreground">{children}</span>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
      {children}
    </a>
  ),
  table: ({ children }) => <table className="mb-4 w-full border-collapse text-[11px] last:mb-0">{children}</table>,
  thead: ({ children }) => <thead className="bg-secondary/70">{children}</thead>,
  th: ({ children }) => <th className="border border-border px-2 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1.5">{children}</td>,
  hr: () => <hr className="my-3 border-border" />,
};

export function GuideMarkdown({ body }: { body: string }) {
  return (
    <ReactMarkdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkSoftBreaks]} components={components}>
      {body}
    </ReactMarkdown>
  );
}
