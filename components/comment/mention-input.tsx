"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { Textarea } from "@/components/ui/textarea"

export type MemberOption = { mem_id: string; mem_nm: string; avatar_url?: string | null }

export function parseMentionsFromText(text: string, members: MemberOption[]): string[] {
  return members
    .filter((m) => {
      const escaped = m.mem_nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      return new RegExp(`@${escaped}(?=[\\s]|$)`).test(text)
    })
    .map((m) => m.mem_id)
}

interface MentionInputProps {
  value: string
  onChange: (value: string) => void
  onMentionsChange?: (memIds: string[]) => void
  members: MemberOption[]
  placeholder?: string
  rows?: number
  className?: string
  autoFocus?: boolean
}

function parseMentionQuery(text: string, cursorPos: number): { query: string; start: number } | null {
  const before = text.slice(0, cursorPos)
  const match = before.match(/@([가-힣a-zA-Z0-9_]*)$/)
  if (!match) return null
  return { query: match[1], start: cursorPos - match[0].length }
}

export function renderMentions(text: string, members: MemberOption[]) {
  const memberNames = new Set(members.map((m) => m.mem_nm))
  const parts = text.split(/(@[가-힣a-zA-Z0-9_]+)/)
  return parts.map((part, i) =>
    part.startsWith("@") && memberNames.has(part.slice(1)) ? (
      <span key={i} className="text-primary font-medium">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export function MentionInput({
  value,
  onChange,
  onMentionsChange,
  members,
  placeholder,
  rows = 3,
  className,
  autoFocus,
}: MentionInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!autoFocus) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    const len = el.value.length
    el.setSelectionRange(len, len)
  }, [autoFocus])

  const [mentionState, setMentionState] = useState<{
    query: string
    start: number
    filtered: MemberOption[]
  } | null>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value
      const cursor = e.target.selectionStart ?? text.length
      onChange(text)

      const parsed = parseMentionQuery(text, cursor)
      if (parsed) {
        const filtered = members.filter((m) =>
          m.mem_nm.toLowerCase().includes(parsed.query.toLowerCase())
        )
        setMentionState(filtered.length > 0 ? { ...parsed, filtered } : null)
      } else {
        setMentionState(null)
      }
    },
    [members, onChange]
  )

  const selectMember = useCallback(
    (member: MemberOption) => {
      if (!mentionState) return
      const cursor = textareaRef.current?.selectionStart ?? value.length
      const before = value.slice(0, mentionState.start)
      const after = value.slice(cursor)
      const newText = `${before}@${member.mem_nm} ${after}`
      onChange(newText)
      mentionedIds.current.add(member.mem_id)
      onMentionsChange?.([...mentionedIds.current])
      setMentionState(null)
      setTimeout(() => {
        const pos = before.length + member.mem_nm.length + 2
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(pos, pos)
      }, 0)
    },
    [mentionState, value, onChange, onMentionsChange]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" && mentionState) {
        setMentionState(null)
        e.preventDefault()
      }
    },
    [mentionState]
  )

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={`resize-none ${className ?? ""}`}
      />
      {mentionState && (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-48 overflow-hidden rounded-lg border border-border bg-background shadow-md">
          {mentionState.filtered.slice(0, 5).map((m) => (
            <button
              key={m.mem_id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onMouseDown={(e) => {
                e.preventDefault()
                selectMember(m)
              }}
            >
              @{m.mem_nm}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
