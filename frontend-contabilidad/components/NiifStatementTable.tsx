import { NiifStatementNode } from '@/lib/accounting-reports'

const currencyFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function fmtCurrency(value?: number | null) {
  return currencyFormatter.format(Number(value ?? 0))
}

type FlattenRow = {
  node: NiifStatementNode
  level: number
}

function flatten(nodes: NiifStatementNode[], level = 0, acc: FlattenRow[] = []) {
  for (const node of nodes ?? []) {
    acc.push({ node, level })
    if (node.children?.length) {
      flatten(node.children, level + 1, acc)
    }
  }
  return acc
}

export function NiifStatementTable({
  nodes,
  showPrevious,
}: {
  nodes: NiifStatementNode[]
  showPrevious?: boolean
}) {
  const rows = flatten(nodes)
  const hasComparative = showPrevious && rows.some((row) => row.node.previousAmount != null)

  return (
    <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-600">Concepto</th>
            <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Periodo</th>
            {hasComparative && (
              <th className="px-4 py-2 text-right text-sm font-medium text-gray-600">Comparativo</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={hasComparative ? 3 : 2} className="px-4 py-4 text-center text-gray-500">
                No hay datos para los parámetros seleccionados.
              </td>
            </tr>
          )}

          {rows.map(({ node, level }, idx) => (
            <tr key={`${node.id}-${idx}`}>
              <td className="px-4 py-2 text-sm" style={{ paddingLeft: `${level * 16 + 16}px` }}>
                <span className="font-medium text-gray-700">{node.label}</span>
                {node.notes && (
                  <span className="ml-2 text-xs text-gray-400">{node.notes}</span>
                )}
              </td>
              <td className="px-4 py-2 text-sm text-right font-mono">
                {fmtCurrency(node.amount)}
              </td>
              {hasComparative && (
                <td className="px-4 py-2 text-sm text-right font-mono">
                  {fmtCurrency(node.previousAmount ?? 0)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
