'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'

type InputRefCb = (el: HTMLInputElement | null) => void

export type Option = {
  value: string | number
  label: string
  sublabel?: string
}

type Props = {
  value?: string | number
  options: Option[]
  onSelect: (opt: Option | null) => void
  placeholder?: string
  disabled?: boolean
  noResultsText?: string
  limit?: number
  // 🔵 nuevas props
  allowCustom?: boolean
  onCustom?: (label: string) => void
  onInputChange?: (text: string) => void
  onInputRef?: InputRefCb
}

export default function SearchSelect({
  value,
  options,
  onSelect,
  placeholder = 'Buscar…',
  disabled = false,
  noResultsText = 'Sin resultados',
  limit = 30,
  allowCustom = false,
  onCustom,
  onInputChange,
  onInputRef,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const assignInputRef = (el: HTMLInputElement | null) => {
  ;(inputRef as MutableRefObject<HTMLInputElement | null>).current = el
    onInputRef?.(el)
  }

  const selected = useMemo(
    () => options.find(o => String(o.value) === String(value)) || null,
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, limit)
    const res = options.filter(o => {
      const hay = (o.label + ' ' + (o.sublabel || '')).toLowerCase()
      return hay.includes(q)
    })
    return res.slice(0, limit)
  }, [options, query, limit])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function handleSelect(idx: number) {
    const opt = filtered[idx] || null
    if (opt) {
      onSelect(opt)
      setOpen(false)
      setQuery('')
      setHighlight(0)
      inputRef.current?.focus()
    }
  }

  function handleCustom(label: string) {
    if (onCustom) {
      onCustom(label)
    }
    setOpen(false)
    setHighlight(0)
    // 🔵 no borramos el query, queda marcado
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlight]) {
        handleSelect(highlight)
      } else if (allowCustom && query.trim()) {
        handleCustom(query.trim())
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="flex gap-2">
        <input
          ref={assignInputRef}
          type="text"
          className="input input-bordered w-full rounded-xl"
          placeholder={placeholder}
          value={open ? query : (selected?.label ?? query)}
          onChange={(e) => {
            setQuery(e.target.value)
            onInputChange?.(e.target.value)
            if (!open) setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
      </div>

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-auto rounded-xl border bg-white shadow">
          {filtered.length === 0 && !allowCustom && (
            <div className="px-3 py-2 text-sm text-gray-500">{noResultsText}</div>
          )}
          {filtered.map((o, i) => (
            <button
              key={String(o.value)}
              type="button"
              className={`w-full text-left px-3 py-2 hover:bg-gray-100 ${i === highlight ? 'bg-gray-100' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => handleSelect(i)}
            >
              <div className="text-sm">{o.label}</div>
              {o.sublabel && <div className="text-xs text-gray-500">{o.sublabel}</div>}
            </button>
          ))}
          {/* 🔵 opción custom */}
          {allowCustom && query.trim() && filtered.length === 0 && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-gray-100"
              onClick={() => handleCustom(query.trim())}
            >
              Crear “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}
