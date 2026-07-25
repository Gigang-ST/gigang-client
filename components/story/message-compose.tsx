"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { toast } from "sonner";

import { createMessage } from "@/app/actions/story/create-message";
import { MESSAGE_TXT_MAX } from "@/lib/validations/message";
import { cn } from "@/lib/utils";

import { Caption } from "@/components/common/typography";
import { SendIcon } from "@/components/story/sky-face";
import { Input } from "@/components/ui/input";

/** 이륙 연출 길이(ms) — globals.css의 `.pledge-liftoff`(0.64s)와 맞춘다 */
const LIFTOFF_MS = 640;

/**
 * 한마디 입력 — 지면에 바로 놓인 한 줄 입력창 + 오른쪽 날리기 버튼.
 *
 * 다이얼로그를 열어 쓰던 것을 지면 인라인으로 내렸다. 한 줄짜리 입력에 모달 한 단계는
 * 과하고, 무엇보다 버튼을 누르는 행위와 "날린다"는 은유가 한 동작으로 붙는다.
 * 누르면 아이콘이 왼쪽으로 날아가며(`pledge-liftoff`) 입력한 글씨를 오른쪽부터
 * 쓸어 지운다(`pledge-wipe`) — 방금 쓴 한 줄이 하늘로 실려 나가는 그림.
 *
 * 두 애니메이션은 착륙장(제거됨)이 쓰던 것을 그대로 재사용한다. 새로 만들지 않은 이유는
 * 이 존의 비행 방향(오→왼)과 이미 맞춰져 있기 때문 — 하늘을 나는 배너와 같은 방향으로
 * 날아가야 "저 하늘로 갔다"가 읽힌다.
 *
 * **연출은 저장을 기다리지 않는다.** 누른 즉시 비행기가 뜨고 입력창은 비워진다(낙관적).
 * 서버가 실패하면 토스트로 알리고 쓴 글을 입력창에 되돌려준다 — 날아가는 걸 본 뒤에
 * 실패를 알게 되지만, 성공이 정상이고 실패는 예외라 이쪽이 낫다. 반대로 저장을 기다리면
 * 누르고 나서 0.5초쯤 아무 일도 안 일어나는 구간이 생겨 버튼이 씹힌 것처럼 느껴진다.
 */
export function MessageCompose({
  onCreated,
  onThrow,
}: {
  /** 저장 성공 후 — 하늘을 다시 그리게 하는 데 쓴다 */
  onCreated?: () => void;
  /**
   * 저장된 한마디를 하늘로 넘긴다 — 던지기는 **하늘 안에서** 일어나므로 무대의 주인은
   * 하늘(`MessagePlanes`)이다. 여기서 열면 입력창 위에 뜨는 별도 화면이 되어,
   * "쓴 걸 저 하늘로 뿌린다"는 그림이 깨진다.
   */
  onThrow?: (msg: { msgId: string; text: string }) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  /** 이륙 연출 재생 중 — 아이콘과 입력 글씨에 애니메이션 클래스를 건다 */
  const [flying, setFlying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);

  // 언마운트 시 이륙 타이머 정리 — 남으면 사라진 컴포넌트에 setState를 시도한다
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const trimmed = value.trim();
  const tooLong = trimmed.length > MESSAGE_TXT_MAX;
  const canSend = trimmed.length > 0 && !tooLong;

  function handleSend() {
    if (!canSend || flying) return;

    const text = trimmed;

    // 연출 먼저 — 누른 즉시 날아가야 버튼이 반응한 것으로 읽힌다.
    setFlying(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setFlying(false);
      setValue("");
    }, LIFTOFF_MS);

    // 저장 실패로 글을 되돌릴 때, 아직 안 끝난 이륙 타이머가 그 값을 setValue("")로
    // 덮지 않게 먼저 타이머를 끈다. 검증 실패처럼 640ms 안에 즉시 실패로 돌아오면
    // 이걸 안 하면 방금 되돌린 글이 그대로 사라진다.
    const restore = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setFlying(false);
      setValue(text);
    };

    void (async () => {
      try {
        const result = await createMessage({ msg_txt: text });
        if (!result.ok) {
          toast.error(result.message ?? "저장에 실패했습니다");
          // 날아간 글을 되돌려준다 — 다시 타이핑하게 만들지 않는다
          restore();
          return;
        }
        onCreated?.();
        router.refresh();

        // 저장이 끝난 **뒤에** 하늘로 넘긴다. 저장 전에 넘기면 던지는 동안 실패가 나서
        // "날린 한마디가 사라지는" 그림이 된다 — 놀이가 글쓰기를 막지 않게 하려면
        // 순서가 이래야 한다(던지기는 이미 떠 있는 한마디를 가지고 노는 것뿐).
        onThrow?.({ msgId: result.msg_id, text });
      } catch {
        toast.error("저장 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        restore();
      }
    })();
  }

  return (
    <div className="flex flex-col gap-1.5 px-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={MESSAGE_TXT_MAX}
            placeholder="오늘 한강 6시 같이 뛸 사람"
            aria-label="한마디 입력"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSend();
              }
            }}
            // 이륙 중엔 글씨가 오른쪽부터 쓸려 지운다. 입력값 자체는 연출이 끝난 뒤 비운다
            // (중간에 비우면 쓸리는 글씨가 사라져 볼 게 없다).
            className={cn(
              "h-11 rounded-xl border-[1.5px] text-[15px]",
              flying && "pledge-wipe",
            )}
          />
        </div>

        {/* 전송 버튼 — 누르면 아이콘이 왼쪽으로 날아간다(하늘의 비행 방향과 같게).
            하늘을 나는 건 사람 얼굴이지만 버튼은 아직 날리지 않은 상태라 동작을
            가리키는 아이콘을 쓴다. aria-label을 주는 이유: 안에 든 건 장식
            아이콘(aria-hidden)이라 이름 없는 버튼이 된다. */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend || flying}
          aria-label="한마디 날리기"
          className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-opacity disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className={cn("block", flying && "pledge-liftoff")}>
            <SendIcon />
          </span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Caption>24시간 동안 하늘을 날다 사라져요.</Caption>
        {trimmed.length > 0 && (
          <Caption className={tooLong ? "text-destructive" : undefined}>
            {trimmed.length}/{MESSAGE_TXT_MAX}
          </Caption>
        )}
      </div>
    </div>
  );
}
