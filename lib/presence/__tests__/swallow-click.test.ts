import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { swallowNextClick } from "@/lib/presence/swallow-click";

/**
 * 공은 **움직이는 표적**이라 누른 자리와 뗀 자리가 다르다. 그 사이 공이 위로 튀어 커서 밑에서
 * 사라지면 브라우저는 뒤에 남은 요소(깅스타그램 칸)로 `click`을 쏜다 — 공을 튕기려던 탭이
 * 남의 버튼을 누른다. 그래서 그 한 번의 click을 삼킨다.
 *
 * ⚠️ **여기서 검증하는 건 "수명 계약"이다** — 한 번만 삼키는가, click이 안 오면 스스로
 * 물러나는가. 캡처 단계에서 React보다 먼저 끊기는지는 **DOM 트리가 있어야** 확인되는데 이
 * 저장소는 node 환경만 쓴다(jsdom 없음). 그쪽은 브라우저에서 눈으로 확인한다.
 *
 * `document` 자리에 Node 내장 `EventTarget`을 끼운다 — 목(mock)이 아니라 **진짜 이벤트
 * 디스패처**라, 리스너 등록·해제와 `preventDefault`가 실제로 동작한다.
 */
describe("swallowNextClick", () => {
  let doc: EventTarget;
  let reached: number;
  const original = globalThis.document;

  /** 뒤에 있는 "깅스타그램 칸" 역할 — 여기까지 닿으면 관통이다 */
  function fireClick(): Event {
    const ev = new Event("click", { cancelable: true });
    doc.dispatchEvent(ev);
    if (!ev.defaultPrevented) reached += 1;
    return ev;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    reached = 0;
    doc = new EventTarget();
    (globalThis as { document?: unknown }).document = doc;
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { document?: unknown }).document = original;
  });

  it("다음 click 한 번을 삼킨다 — 뒤 요소까지 안 닿는다", () => {
    swallowNextClick();
    fireClick();
    expect(reached).toBe(0);
  });

  it("**한 번만** 삼킨다 — 그 다음 클릭은 정상 통과", () => {
    swallowNextClick();
    fireClick();
    fireClick();
    expect(reached).toBe(1);
  });

  it("삼킨 click은 기본동작도 막는다", () => {
    swallowNextClick();
    expect(fireClick().defaultPrevented).toBe(true);
  });

  it("click이 안 오면 스스로 물러난다 — 엉뚱한 클릭을 잡아먹지 않는다", () => {
    // 탭이 취소돼(pointercancel·창 포커스 이동 등) click이 영영 안 오는 경우.
    // 리스너가 남아 있으면 한참 뒤의 **무관한 클릭**이 씹힌다.
    swallowNextClick();
    vi.advanceTimersByTime(1000);
    fireClick();
    expect(reached).toBe(1);
  });

  it("연타 — 탭마다 자기 click이 삼켜진다", () => {
    // 실제 순서는 탭1(등록) → click1 → 탭2(등록) → click2 다. 탭이 자기 click을 하나씩
    // 만들므로 가드와 click이 1:1로 짝지어진다.
    swallowNextClick();
    fireClick();
    swallowNextClick();
    fireClick();
    expect(reached).toBe(0);
  });

  it("첫 탭의 죽은 타이머가 두 번째 탭의 가드를 떼어가지 않는다", () => {
    // click으로 이미 정리된 가드의 타임아웃이 뒤늦게 돌면서 **그 사이 새로 건** 가드까지
    // 떼어버리면, 두 번째 탭이 그대로 관통한다. 첫 가드가 자기 타이머를 확실히 껐는지 본다.
    swallowNextClick();
    fireClick(); // 여기서 1번 가드와 그 타이머가 정리돼야 한다
    swallowNextClick(); // 2번 가드
    vi.advanceTimersByTime(399); // 2번 가드는 아직 살아 있어야 하는 시점
    fireClick();
    expect(reached).toBe(0);
  });

  it("document가 없는 환경(서버)에서는 아무것도 안 한다", () => {
    (globalThis as { document?: unknown }).document = undefined;
    expect(() => swallowNextClick()).not.toThrow();
  });
});
