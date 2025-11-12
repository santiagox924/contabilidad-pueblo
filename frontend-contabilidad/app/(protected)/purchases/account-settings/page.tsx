'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import SearchSelect from '@/components/SearchSelect'
import { USER_ROLES } from '@/lib/roles'
import { listAccounts, type Account } from '@/lib/accounts'
import {
  listPurchaseAccountSettings,
  updateAccountSetting,
  type PurchaseAccountSetting,
} from '@/lib/account-settings'
import { useCallback, useEffect, useMemo, useState } from 'react'

export default function PurchaseAccountSettingsPage() {
  const [settings, setSettings] = useState<PurchaseAccountSetting[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listPurchaseAccountSettings()
      setSettings(data)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'No fue posible cargar la configuración contable.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAccounts = useCallback(async () => {
    try {
      const rows = await listAccounts()
      setAccounts(rows)
    } catch (err) {
      // dejamos constancia en consola para diagnóstico, pero no bloqueamos la vista
      console.error('[purchase-account-settings] No se pudieron cargar las cuentas', err)
    }
  }, [])

  useEffect(() => {
    loadSettings()
    loadAccounts()
  }, [loadSettings, loadAccounts])

  const accountOptions = useMemo(() => {
    return accounts.map(acc => ({
      value: acc.code,
      label: `${acc.code} · ${acc.name}`,
      sublabel: `${acc.class} · ${acc.nature}${acc.requiresThirdParty ? ' · Tercero' : ''}${acc.requiresCostCenter ? ' · C. costo' : ''}`,
    }))
  }, [accounts])

  const handleSelect = useCallback(async (key: string, accountCode: string) => {
    setSavingKey(key)
    setMessage(null)
    setError(null)
    try {
      const updated = await updateAccountSetting(key, accountCode)
      setSettings(prev => prev.map(row => (row.key === key ? updated : row)))
      setMessage('Cuenta actualizada correctamente.')
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'No fue posible actualizar la cuenta.'
      setError(msg)
    } finally {
      setSavingKey(null)
    }
  }, [])

  const currentAccountName = useCallback(
    (code: string) => {
      const account = accounts.find(acc => acc.code === code)
      return account ? account.name : ''
    },
    [accounts],
  )

  return (
    <Protected roles={[USER_ROLES.PURCHASING, USER_ROLES.ADMINISTRATOR, USER_ROLES.SUPER_ADMIN, USER_ROLES.ACCOUNTANT, USER_ROLES.ACCOUNTING_ADMIN]}>
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">Modificación de cuentas para compras</h1>
            <div className="flex gap-2">
              <a className="btn" href="/purchases">Volver a compras</a>
              <button className="btn" onClick={loadSettings} disabled={loading}>
                {loading ? 'Actualizando…' : 'Recargar'}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-600 max-w-3xl">
            Ajusta aquí las cuentas contables que usa el sistema al registrar facturas de compra.
            Los cambios aplican de inmediato para nuevas contabilizaciones.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {message && !error && (
          <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">
            {message}
          </div>
        )}

        <section className="card">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="th">Concepto</th>
                  <th className="th">Cuenta configurada</th>
                  <th className="th">Cuenta sugerida</th>
                  <th className="th">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {settings.map((row) => {
                  const currentLabel = row.account?.name ?? currentAccountName(row.accountCode)
                  return (
                    <tr key={row.key}>
                      <td className="td align-top">
                        <div className="font-medium">{row.label}</div>
                        {row.description && (
                          <div className="text-sm text-gray-600 mt-1">{row.description}</div>
                        )}
                      </td>
                      <td className="td align-top">
                        <div className="space-y-2">
                          <SearchSelect
                            value={row.accountCode}
                            options={accountOptions}
                            onSelect={(opt) => {
                              if (!opt) return
                              const nextCode = String(opt.value)
                              if (nextCode !== row.accountCode) {
                                handleSelect(row.key, nextCode)
                              }
                            }}
                            disabled={savingKey === row.key}
                            placeholder="Selecciona una cuenta"
                          />
                          <div className="text-xs text-gray-500">
                            {savingKey === row.key ? 'Guardando…' : currentLabel ? `${row.accountCode} · ${currentLabel}` : row.accountCode}
                          </div>
                        </div>
                      </td>
                      <td className="td align-top">
                        <div className="text-sm text-gray-700">
                          {row.defaultCode}
                        </div>
                        <div className="text-xs text-gray-500">
                          {row.isDefault ? 'Usando valor por defecto' : 'Valor sugerido inicial'}
                        </div>
                      </td>
                      <td className="td align-top text-sm text-gray-600">
                        {row.account?.requiresThirdParty && <div>Requiere tercero</div>}
                        {row.account?.requiresCostCenter && <div>Requiere centro de costo</div>}
                        {!row.account?.requiresThirdParty && !row.account?.requiresCostCenter && (
                          <div>Sin requisitos adicionales</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && settings.length === 0 && (
              <p className="p-4 text-sm text-gray-600">No hay cuentas configuradas para este módulo.</p>
            )}
            {loading && (
              <p className="p-4 text-sm text-gray-600">Cargando…</p>
            )}
          </div>
        </section>
      </main>
    </Protected>
  )
}
