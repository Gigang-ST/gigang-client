/**
 * 마크다운 문단 안의 줄바꿈(엔터 한 번)을 그대로 줄바꿈으로 보이게 하는 remark 플러그인 — `remark-breaks` 와 같은 일.
 *
 * 표준 마크다운은 엔터 한 번을 공백으로 붙여 버려(빈 줄이나 줄 끝 `\` 가 있어야 줄이 바뀐다), 운영진이 팀 설정 에디터에서
 * 엔터로 나눈 줄이 화면에선 한 줄로 이어진다(#748 신입 안내). 의존성 하나 늘리기보다 열 줄짜리라 직접 둔다.
 * 목록·표·제목 같은 구조는 손대지 않고, 글(text) 안의 `\n` 만 줄바꿈(break)으로 바꾼다.
 */
type MdNode = { type: string; value?: string; children?: MdNode[] };

function splitBreaks(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && child.value?.includes("\n")) {
      child.value.split("\n").forEach((part, i) => {
        if (i > 0) next.push({ type: "break" });
        if (part) next.push({ type: "text", value: part });
      });
    } else {
      splitBreaks(child);
      next.push(child);
    }
  }
  node.children = next;
}

export default function remarkSoftBreaks() {
  return (tree: MdNode) => splitBreaks(tree);
}
