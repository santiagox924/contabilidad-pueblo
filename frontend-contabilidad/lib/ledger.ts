export type AccountNature = 'DEBIT' | 'CREDIT'

export interface LedgerLine {
  date: string
  description?: string | null
  debit: number
  credit: number
  balance: number
  docRef?: string | null
}

export interface LedgerResponse {
  account: { code: string; name: string; nature: AccountNature }
  opening: number
  closing: number
  lines: LedgerLine[]
}

export type RawLedgerLine = {
  date: string | Date
  description?: string | null
  docRef?: string | null
  debit?: number | null
  credit?: number | null
  balance?: number | null
  runBalance?: number | null
  sourceType?: string | null
  sourceId?: string | number | null
}

export type RawLedgerResponse = {
  account?: { code?: string; name?: string; nature?: string | null }
  lines?: RawLedgerLine[] | null
  rows?: RawLedgerLine[] | null
  opening?: number | null
  closing?: number | null
}

function normalizeNature(nature?: string | null): AccountNature {
  if (!nature) return 'DEBIT'
  const upper = nature.toUpperCase()
  if (upper === 'D' || upper === 'DEBIT') return 'DEBIT'
  if (upper === 'C' || upper === 'CREDIT') return 'CREDIT'
  return 'DEBIT'
}

function computeDelta(nature: AccountNature, debit: number, credit: number) {
  return nature === 'DEBIT' ? debit - credit : credit - debit
}

function formatDocRef(line: RawLedgerLine) {
  if (line.docRef) return line.docRef
  const type = line.sourceType?.trim()
  const id = line.sourceId != null && line.sourceId !== '' ? String(line.sourceId) : null
  const normalizedType = type
    ? type
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : null
  if (normalizedType && id) return `${normalizedType} #${id}`
  if (normalizedType) return normalizedType
  if (id) return `#${id}`
  return null
}

export function normalizeLedgerResponse(
  raw: RawLedgerResponse | null,
  fallbackCode: string,
): LedgerResponse | null {
  if (!raw) return null
  const nature = normalizeNature(raw.account?.nature)
  const opening = typeof raw.opening === 'number' ? raw.opening : 0
  const source = Array.isArray(raw.lines)
    ? raw.lines
    : Array.isArray(raw.rows)
      ? raw.rows
      : []

  let run = opening
  const lines = source.map((line) => {
    const rawDate = line.date
    const date = rawDate instanceof Date
      ? rawDate.toISOString().slice(0, 10)
      : rawDate ?? ''
    const debit = Number(line.debit ?? 0)
    const credit = Number(line.credit ?? 0)

    if (typeof line.balance === 'number') {
      run = Number(line.balance)
    } else if (typeof line.runBalance === 'number') {
      run = Number(line.runBalance)
    } else {
      run = run + computeDelta(nature, debit, credit)
    }

    return {
      date,
      description: line.description ?? null,
      debit,
      credit,
      balance: run,
      docRef: formatDocRef(line),
    }
  })

  const closing = typeof raw.closing === 'number'
    ? raw.closing
    : lines.length
      ? lines[lines.length - 1].balance
      : run

  return {
    account: {
      code: raw.account?.code ?? fallbackCode,
      name: raw.account?.name ?? '',
      nature,
    },
    opening,
    closing,
    lines,
  }
}
