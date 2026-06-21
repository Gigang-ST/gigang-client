"use client"

import { useEffect } from "react"
import type { UseFormReturn, FieldValues, DefaultValues } from "react-hook-form"

/**
 * 폼 값을 sessionStorage에 자동 저장/복원합니다.
 * iOS PWA 백그라운드 전환 시 탭 언로드로 폼이 초기화되는 문제를 방지합니다.
 *
 * - open=true 시: sessionStorage에 저장된 값이 있으면 복원
 * - 값 변경 시: 300ms debounce로 sessionStorage에 저장
 * - clear(): 제출 성공 또는 닫기 시 저장값 삭제
 */
export function useFormPersist<T extends FieldValues>(
  key: string,
  form: UseFormReturn<T>,
  open: boolean,
) {
  // open 시 복원
  useEffect(() => {
    if (!open) return
    try {
      const saved = sessionStorage.getItem(key)
      if (saved) {
        const parsed = JSON.parse(saved) as DefaultValues<T>
        form.reset(parsed)
      }
    } catch {
      // sessionStorage 파싱 실패 시 무시
    }
  // form.reset은 안정적인 참조가 아니므로 의존성에서 제외
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, open])

  // 값 변경 시 저장 (300ms debounce)
  useEffect(() => {
    if (!open) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const sub = form.watch((values) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          sessionStorage.setItem(key, JSON.stringify(values))
        } catch {
          // 저장 실패 시 무시
        }
      }, 300)
    })
    return () => {
      sub.unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [key, open, form])

  return {
    clear: () => {
      try { sessionStorage.removeItem(key) } catch { /* 무시 */ }
    },
  }
}
