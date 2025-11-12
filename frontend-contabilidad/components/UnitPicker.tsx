// components/UnitPicker.tsx
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Uom, UOM_LABELS, labelOf, filterUoms, UomFamily } from '@/lib/uom'

type Props = {
  value?: Uom
  onChange: (u?: Uom) => void

  /** Placeholder del input de búsqueda */
  placeholder?: string

  /** SUGERENCIA (deprecated): familias permitidas múltiples */
  allowedFamilies?: UomFamily[]

  /** SUGERENCIA: una sola familia sugerida (preferida por las pantallas nuevas) */
  family?: UomFamily

  /** Solo para accesibilidad/analytics; no se renderiza visualmente */
  label?: string

  disabled?: boolean
  maxSuggestions?: number
  className?: string
}

const UnitPicker: React.FC<Props> = ({
  value,
  onChange,
  placeholder = 'Buscar unidad (ej: kg, litro, docena)…',
  allowedFamilies,
  family,
  disabled = false,
  maxSuggestions = 8,
  className = '',
}) => {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [highlight, setHighlight] = useState(0)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Construye el conjunto de sugerencias:
  // - Si viene `family`, prioriza esa familia
  // - Si vienen `allowedFamilies`, combina esas familias
  // - Si no, busca en todas las unidades
  const suggestions = useMemo(() => {
    let list: Uom[] = []
    if (family) {
      list = filterUoms(q, family)
    } else if (allowedFamilies && allowedFamilies.length) {
      list = allowedFamilies.flatMap(f => filterUoms(q, f))
    } else {
      list = filterUoms(q)
    }
    // Únicos + límite
    return Array.from(new Set(list)).slice(0, maxSuggestions)
  }, [q, family, allowedFamilies, maxSuggestions])

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true)
      return
    }
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(suggestions.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = suggestions[highlight]
      if (pick) {
        pickUnit(pick)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function pickUnit(u: Uom) {
    onChange(u)
    setOpen(false)
    setQ('')
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <input
            ref={inputRef}
            className="input w-full"
            placeholder={placeholder}
            aria-label={placeholder}
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); setHighlight(0) }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            disabled={disabled}
          />
        </div>
        {value && (
          <span className="text-sm font-medium whitespace-nowrap">{labelOf(value)}</span>
        )}
      </div>

      {/* Sugerencias */}
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border bg-white shadow">
          <ul className="max-h-64 overflow-auto py-1">
            {suggestions.map((u, idx) => (
              <li key={u}>
                <button
                  type="button"
                  className={[
                    'w-full text-left px-3 py-2 text-sm',
                    idx === highlight ? 'bg-gray-100' : 'hover:bg-gray-50'
                  ].join(' ')}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => pickUnit(u)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{u}</span>
                    <span className="text-gray-600 truncate">{UOM_LABELS[u]}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Sin resultados */}
      {open && suggestions.length === 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border bg-white shadow px-3 py-2 text-sm text-gray-600">
          Sin resultados
        </div>
      )}
    </div>
  )
}

export default UnitPicker
