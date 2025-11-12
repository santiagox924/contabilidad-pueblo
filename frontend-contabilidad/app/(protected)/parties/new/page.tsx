'use client'

import Protected from '@/components/Protected'
import Navbar from '@/components/Navbar'
import SearchSelect from '@/components/SearchSelect'
import { api } from '@/lib/api'
import { listAccounts, type Account } from '@/lib/accounts'
import {
  PARTY_TYPE_LABEL,
  PARTY_TYPES,
  getDefaultPayableAccount,
  getDefaultReceivableAccount,
  isPayableAccountEligible,
  isReceivableAccountEligible,
  type PartyType,
} from '@/lib/party-accounts'
import { listTaxes, type Tax } from '@/lib/taxes'
import type { FiscalRegime, TaxProfile } from '@/lib/partners-fiscal'
import Link from 'next/link'
import { searchMunicipalities, getMunicipalityByCode, type Municipality } from '@/lib/municipalities'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

type PersonKind = 'NATURAL' | 'JURIDICAL'
type IdType = 'NIT' | 'CC' | 'PASSPORT' | 'OTHER'

const RESPONSIBILITY_OPTIONS = [
  'Régimen simple',
  'Régimen común',
  'No responsable de IVA',
  'Autorretenedor',
  'Gran contribuyente',
]

const FISCAL_REGIME_OPTIONS: { value: FiscalRegime; label: string }[] = [
  { value: 'RESPONSABLE_IVA', label: 'Responsable de IVA' },
  { value: 'NO_RESPONSABLE_IVA', label: 'No responsable de IVA' },
  { value: 'SIMPLE', label: 'Régimen simple' },
  { value: 'ESPECIAL', label: 'Régimen especial' },
]

const TAX_PROFILE_OPTIONS: { value: TaxProfile; label: string }[] = [
  { value: 'IVA_RESPONSABLE', label: 'Gravado (IVA responsable)' },
  { value: 'EXENTO', label: 'Exento (0%)' },
  { value: 'EXCLUIDO', label: 'Excluido (0%)' },
  { value: 'NA', label: 'No aplica' },
]

const isAbortError = (error: any) =>
  error?.code === 'ERR_CANCELED' || error?.name === 'AbortError' || error?.name === 'CanceledError'

export default function NewPartyPage() {
  const router = useRouter()

  const [roles, setRoles] = useState<PartyType[]>(['CLIENT'])
  const [personKind, setPersonKind] = useState<PersonKind>('NATURAL')
  const [idType, setIdType] = useState<IdType>('CC')
  const [document_, setDocument] = useState('')

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [active, setActive] = useState(true)

  const [legalRepName, setLegalRepName] = useState('')
  const [responsibilities, setResponsibilities] = useState<string[]>([])

  const [fiscalRegime, setFiscalRegime] = useState<FiscalRegime>('RESPONSABLE_IVA')
  const [isWithholdingAgent, setWithholdingAgent] = useState(false)
  const [ciiuCode, setCiiuCode] = useState('')
  const [municipalityCode, setMunicipalityCode] = useState('')
  const [taxProfile, setTaxProfile] = useState<TaxProfile>('IVA_RESPONSABLE')
  const [defaultVatId, setDefaultVatId] = useState<number | null>(null)
  const [receivableAccountCode, setReceivableAccountCode] = useState('')
  const [payableAccountCode, setPayableAccountCode] = useState('')
  const [clientReceivableAccountCode, setClientReceivableAccountCode] = useState('')
  const [providerPayableAccountCode, setProviderPayableAccountCode] = useState('')
  const [employeePayableAccountCode, setEmployeePayableAccountCode] = useState('')
  const [otherReceivableAccountCode, setOtherReceivableAccountCode] = useState('')
  const [otherPayableAccountCode, setOtherPayableAccountCode] = useState('')

  // payroll applicability flags for employees
  const [appliesSalary, setAppliesSalary] = useState(true)
  const [appliesWithholding, setAppliesWithholding] = useState(true)
  const [appliesEps, setAppliesEps] = useState(true)
  const [appliesPension, setAppliesPension] = useState(true)
  const [appliesArl, setAppliesArl] = useState(true)
  const [appliesCcf, setAppliesCcf] = useState(true)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [taxes, setTaxes] = useState<Tax[]>([])
  const [metaLoading, setMetaLoading] = useState(true)
  const [metaError, setMetaError] = useState<string | null>(null)

  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null)
  const [municipalitySearchText, setMunicipalitySearchText] = useState('')
  const [municipalityLoading, setMunicipalityLoading] = useState(false)
  const [municipalityError, setMunicipalityError] = useState<string | null>(null)
  const municipalityAbortRef = useRef<AbortController | null>(null)
  const municipalityDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const partyRolesRef = useRef<PartyType[]>(roles)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setMetaLoading(true)
    setMetaError(null)
    Promise.all([
      listAccounts(controller.signal),
      listTaxes({ active: true, kind: 'VAT' }, controller.signal),
    ])
      .then(([acc, vats]) => {
        setAccounts(acc)
        setTaxes(vats)
      })
      .catch((e: any) => {
        if (isAbortError(e) || controller.signal.aborted) return
        setMetaError(e?.message ?? 'No se pudieron cargar las cuentas o impuestos')
      })
      .finally(() => {
        if (!controller.signal.aborted) setMetaLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setMunicipalityLoading(true)
    setMunicipalityError(null)
    searchMunicipalities({ take: 20 }, controller.signal)
      .then(rows => {
        if (!controller.signal.aborted) {
          setMunicipalities(rows)
        }
      })
      .catch(err => {
        if (isAbortError(err) || controller.signal.aborted) return
        setMunicipalityError(err?.message ?? 'No se pudieron cargar los municipios')
      })
      .finally(() => {
        if (!controller.signal.aborted) setMunicipalityLoading(false)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (municipalityDebounceRef.current) {
      clearTimeout(municipalityDebounceRef.current)
      municipalityDebounceRef.current = null
    }

    const term = municipalitySearchText.trim()
    if (!term) {
      setMunicipalityError(null)
      municipalityAbortRef.current?.abort()
      municipalityAbortRef.current = null
      setMunicipalityLoading(false)
      return
    }

    municipalityDebounceRef.current = setTimeout(() => {
      municipalityAbortRef.current?.abort()
      const controller = new AbortController()
      municipalityAbortRef.current = controller
      setMunicipalityLoading(true)
      setMunicipalityError(null)
      searchMunicipalities({ query: term, take: 20 }, controller.signal)
        .then(rows => {
          if (!controller.signal.aborted) {
            setMunicipalities(rows)
          }
        })
        .catch(err => {
          if (isAbortError(err) || controller.signal.aborted) return
          setMunicipalityError(err?.message ?? 'No se pudieron cargar los municipios')
        })
        .finally(() => {
          if (!controller.signal.aborted) setMunicipalityLoading(false)
        })
    }, 250)

    return () => {
      if (municipalityDebounceRef.current) {
        clearTimeout(municipalityDebounceRef.current)
        municipalityDebounceRef.current = null
      }
      municipalityAbortRef.current?.abort()
    }
  }, [municipalitySearchText])

  useEffect(() => {
    if (!municipalityCode) {
      setSelectedMunicipality(null)
      return
    }

    const existing = municipalities.find(m => m.code === municipalityCode)
    if (existing) {
      setSelectedMunicipality(existing)
      return
    }

    const controller = new AbortController()
    getMunicipalityByCode(municipalityCode, controller.signal)
      .then(row => {
        if (!controller.signal.aborted) {
          setSelectedMunicipality(row)
        }
      })
      .catch(err => {
        if (isAbortError(err) || controller.signal.aborted) return
        setMunicipalityError(err?.message ?? 'No se pudo obtener el municipio seleccionado')
      })
    return () => controller.abort()
  }, [municipalityCode, municipalities])

  useEffect(() => {
    if (taxProfile !== 'IVA_RESPONSABLE') {
      setDefaultVatId(null)
    }
  }, [taxProfile])

  useEffect(() => {
    const currentSet = new Set(roles)
    const defaultReceivable = getDefaultReceivableAccount(roles) ?? ''
    const defaultPayable = getDefaultPayableAccount(roles) ?? ''

    const ensureValue = (
      hasRole: boolean,
      current: string,
      fallback: string,
      setter: (value: string) => void,
    ) => {
      const normalizedFallback = fallback.trim()
      if (!hasRole) {
        if (current !== '') setter('')
        return ''
      }
      const trimmed = current.trim()
      if (trimmed) return trimmed
      if (current !== normalizedFallback) setter(normalizedFallback)
      return normalizedFallback
    }

    const nextClient = ensureValue(
      currentSet.has('CLIENT'),
      clientReceivableAccountCode,
      defaultReceivable,
      setClientReceivableAccountCode,
    )
    const nextOtherReceivable = ensureValue(
      currentSet.has('OTHER'),
      otherReceivableAccountCode,
      defaultReceivable,
      setOtherReceivableAccountCode,
    )
    const nextProvider = ensureValue(
      currentSet.has('PROVIDER'),
      providerPayableAccountCode,
      defaultPayable,
      setProviderPayableAccountCode,
    )
    const nextEmployee = ensureValue(
      currentSet.has('EMPLOYEE'),
      employeePayableAccountCode,
      defaultPayable,
      setEmployeePayableAccountCode,
    )
    const nextOtherPayable = ensureValue(
      currentSet.has('OTHER'),
      otherPayableAccountCode,
      defaultPayable,
      setOtherPayableAccountCode,
    )

    const computedReceivable = nextClient || nextOtherReceivable || defaultReceivable || ''
    if (receivableAccountCode !== computedReceivable) {
      setReceivableAccountCode(computedReceivable)
    }

    const computedPayable =
      nextProvider || nextEmployee || nextOtherPayable || defaultPayable || ''
    if (payableAccountCode !== computedPayable) {
      setPayableAccountCode(computedPayable)
    }

    partyRolesRef.current = roles
  }, [
    roles,
    receivableAccountCode,
    payableAccountCode,
    clientReceivableAccountCode,
    providerPayableAccountCode,
    employeePayableAccountCode,
    otherReceivableAccountCode,
    otherPayableAccountCode,
  ])

  const documentPlaceholder = useMemo(() => {
    switch (idType) {
      case 'NIT':
        return 'NIT (ej: 900123456-7)'
      case 'CC':
        return 'Cédula (CC)'
      case 'PASSPORT':
        return 'Pasaporte'
      default:
        return 'Otro documento'
    }
  }, [idType])

  const accountToOption = (acc: Account) => {
    const badges: string[] = []
    if (acc.flowType === 'AR') badges.push('CxC')
    if (acc.flowType === 'AP') badges.push('CxP')
    if (acc.requiresThirdParty) badges.push('Requiere tercero')

    return {
      value: acc.code,
      label: `${acc.code} · ${acc.name}`,
      sublabel: badges.length ? badges.join(' · ') : undefined,
    }
  }

  const receivableAccountOptions = useMemo(() => {
    const base = accounts
      .filter(isReceivableAccountEligible)
      .map(accountToOption)

    const requiredCodes = [
      receivableAccountCode,
      clientReceivableAccountCode,
      otherReceivableAccountCode,
    ].filter(Boolean)

    const existing = new Set(base.map(opt => String(opt.value)))
    for (const code of requiredCodes) {
      const codeStr = String(code)
      if (!existing.has(codeStr)) {
        const account = accounts.find(acc => acc.code === codeStr)
        if (account) {
          const option = accountToOption(account)
          option.sublabel = option.sublabel
            ? `${option.sublabel} · ⚠ Fuera de categoría`
            : '⚠ Fuera de categoría'
          base.unshift(option)
          existing.add(codeStr)
        }
      }
    }

    return base
  }, [
    accounts,
    receivableAccountCode,
    clientReceivableAccountCode,
    otherReceivableAccountCode,
  ])

  const payableAccountOptions = useMemo(() => {
    const base = accounts
      .filter(isPayableAccountEligible)
      .map(accountToOption)

    const requiredCodes = [
      payableAccountCode,
      providerPayableAccountCode,
      employeePayableAccountCode,
      otherPayableAccountCode,
    ].filter(Boolean)

    const existing = new Set(base.map(opt => String(opt.value)))
    for (const code of requiredCodes) {
      const codeStr = String(code)
      if (!existing.has(codeStr)) {
        const account = accounts.find(acc => acc.code === codeStr)
        if (account) {
          const option = accountToOption(account)
          option.sublabel = option.sublabel
            ? `${option.sublabel} · ⚠ Fuera de categoría`
            : '⚠ Fuera de categoría'
          base.unshift(option)
          existing.add(codeStr)
        }
      }
    }

    return base
  }, [
    accounts,
    payableAccountCode,
    providerPayableAccountCode,
    employeePayableAccountCode,
    otherPayableAccountCode,
  ])

  const vatOptions = useMemo(
    () =>
      taxes.map(t => ({
        value: t.id,
        label: `${t.code} · ${t.name} (${t.ratePct.toFixed(2)}%)`,
      })),
    [taxes],
  )

  const municipalityOptions = useMemo(() => {
    const mapped = municipalities.map(m => ({
      value: m.code,
      label: `${m.code} · ${m.name}`,
      sublabel: m.departmentName,
    }))
    if (
      selectedMunicipality &&
      !mapped.some(opt => String(opt.value) === selectedMunicipality.code)
    ) {
      mapped.unshift({
        value: selectedMunicipality.code,
        label: `${selectedMunicipality.code} · ${selectedMunicipality.name}`,
        sublabel: selectedMunicipality.departmentName,
      })
    }
    return mapped
  }, [municipalities, selectedMunicipality])

  const selectedClientReceivable = useMemo(
    () => accounts.find(acc => acc.code === clientReceivableAccountCode) || null,
    [accounts, clientReceivableAccountCode],
  )

  const selectedProviderPayable = useMemo(
    () => accounts.find(acc => acc.code === providerPayableAccountCode) || null,
    [accounts, providerPayableAccountCode],
  )

  const selectedEmployeePayable = useMemo(
    () => accounts.find(acc => acc.code === employeePayableAccountCode) || null,
    [accounts, employeePayableAccountCode],
  )

  const selectedOtherReceivable = useMemo(
    () => accounts.find(acc => acc.code === otherReceivableAccountCode) || null,
    [accounts, otherReceivableAccountCode],
  )

  const selectedOtherPayable = useMemo(
    () => accounts.find(acc => acc.code === otherPayableAccountCode) || null,
    [accounts, otherPayableAccountCode],
  )

  const primaryRole = roles[0] ?? 'OTHER'

  function normalizeRolesSelection(list: PartyType[]): PartyType[] {
    const ordered: PartyType[] = []
    for (const role of list) {
      if (!PARTY_TYPES.includes(role)) continue
      if (!ordered.includes(role)) ordered.push(role)
    }
    if (!ordered.length) ordered.push('OTHER')
    return ordered
  }

  function toggleRole(role: PartyType) {
    setRoles(prev => {
      const exists = prev.includes(role)
      const next = exists ? prev.filter(r => r !== role) : [...prev, role]
      return normalizeRolesSelection(next)
    })
  }

  function makePrimary(role: PartyType) {
    setRoles(prev => {
      const without = prev.filter(r => r !== role)
      return normalizeRolesSelection([role, ...without])
    })
  }

  function toggleResponsibility(tag: string) {
    setResponsibilities(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    )
  }

  function validate(): string | null {
    if (!roles.length) return 'Selecciona al menos un rol'
    if (!name.trim()) return 'El nombre es obligatorio'
    
    if (ciiuCode && ciiuCode.length < 3) {
      return 'El código CIIU debe tener al menos 3 caracteres'
    }
    if (municipalityCode && municipalityCode.length !== 5) {
      return 'El código de municipio debe tener 5 dígitos'
    }
    return null
  }

  async function submit(thenInvoice: boolean) {
    const validation = validate()
    if (validation) {
      setError(validation)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const payload: any = {
        type: primaryRole,
        roles,
        personKind,
        idType,
        legalRepName:
          personKind === 'JURIDICAL' && legalRepName.trim()
            ? legalRepName.trim()
            : undefined,
        responsibilities:
          personKind === 'JURIDICAL' && responsibilities.length > 0
            ? responsibilities
            : personKind === 'JURIDICAL'
              ? []
              : undefined,
        document: document_.trim() || undefined,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        active,
        
        fiscalRegime,
        isWithholdingAgent,
        ciiuCode: ciiuCode.trim() ? ciiuCode.trim().toUpperCase() : undefined,
        municipalityCode: municipalityCode.trim() || undefined,
        taxProfile,
        defaultVatId:
          taxProfile === 'IVA_RESPONSABLE'
            ? defaultVatId ?? undefined
            : null,
        receivableAccountCode: receivableAccountCode.trim()
          ? receivableAccountCode.trim()
          : undefined,
        payableAccountCode: payableAccountCode.trim()
          ? payableAccountCode.trim()
          : undefined,
        clientReceivableAccountCode:
          roles.includes('CLIENT') && clientReceivableAccountCode.trim()
            ? clientReceivableAccountCode.trim()
            : undefined,
        providerPayableAccountCode:
          roles.includes('PROVIDER') && providerPayableAccountCode.trim()
            ? providerPayableAccountCode.trim()
            : undefined,
        employeePayableAccountCode:
          roles.includes('EMPLOYEE') && employeePayableAccountCode.trim()
            ? employeePayableAccountCode.trim()
            : undefined,
        // payroll applicability flags (only meaningful for employees)
        appliesSalary: roles.includes('EMPLOYEE') ? appliesSalary : undefined,
        appliesWithholding: roles.includes('EMPLOYEE') ? appliesWithholding : undefined,
        appliesEps: roles.includes('EMPLOYEE') ? appliesEps : undefined,
        appliesPension: roles.includes('EMPLOYEE') ? appliesPension : undefined,
        appliesArl: roles.includes('EMPLOYEE') ? appliesArl : undefined,
        appliesCcf: roles.includes('EMPLOYEE') ? appliesCcf : undefined,
        otherReceivableAccountCode:
          roles.includes('OTHER') && otherReceivableAccountCode.trim()
            ? otherReceivableAccountCode.trim()
            : undefined,
        otherPayableAccountCode:
          roles.includes('OTHER') && otherPayableAccountCode.trim()
            ? otherPayableAccountCode.trim()
            : undefined,
      }

      const res = await api.post('/parties', payload)
      const createdId = (res as any)?.data?.id ?? (res as any)?.id
      if (!createdId) throw new Error('No se pudo crear el tercero')

      router.push(
        thenInvoice
          ? `/sales/new-invoice?partyId=${createdId}`
          : '/parties',
      )
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'No se pudo crear el tercero'
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Protected>
      <Navbar />
      <main className="container py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Nuevo tercero</h1>
            <p className="text-sm text-gray-500">
              Registra clientes, proveedores, empleados u otros terceros.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/parties" className="btn">
              Volver
            </Link>
          </div>
        </div>

        <form
          className="card space-y-6"
          onSubmit={e => {
            e.preventDefault()
            submit(false)
          }}
        >
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label">Roles del tercero</label>
              <div className="flex flex-wrap gap-2">
                {PARTY_TYPES.map(role => {
                  const checked = roles.includes(role)
                  const isPrimary = role === primaryRole
                  const checkboxId = `party-role-${role.toLowerCase()}`
                  return (
                    <label
                      key={role}
                      htmlFor={checkboxId}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none ${
                        checked ? 'border-primary bg-primary/10' : 'border-base-300 bg-white'
                      }`}
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={checked}
                        onChange={() => toggleRole(role)}
                      />
                      <span className="text-sm font-medium text-gray-700">
                        {PARTY_TYPE_LABEL[role]}
                      </span>
                      {checked && (
                        <button
                          type="button"
                          className={`text-xs ${
                            isPrimary
                              ? 'text-primary font-semibold cursor-default'
                              : 'text-blue-600 hover:underline'
                          }`}
                          onClick={event => {
                            event.preventDefault()
                            event.stopPropagation()
                            if (!isPrimary) makePrimary(role)
                          }}
                          disabled={isPrimary}
                        >
                          {isPrimary ? 'Principal' : 'Hacer principal'}
                        </button>
                      )}
                    </label>
                  )
                })}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Selecciona uno o varios roles. El rol marcado como principal define las cuentas y parámetros por defecto.
              </p>
            </div>

            <div>
              <label className="label">Persona</label>
              <select
                className="input"
                value={personKind}
                onChange={e => setPersonKind(e.target.value as PersonKind)}
              >
                <option value="NATURAL">Natural</option>
                <option value="JURIDICAL">Jurídica</option>
              </select>
            </div>

            <div>
              <label className="label">Estado</label>
              <div className="flex items-center gap-3 h-10">
                <input
                  id="active"
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={active}
                  onChange={e => setActive(e.target.checked)}
                />
                <label htmlFor="active" className="cursor-pointer text-sm">
                  {active ? 'Activo' : 'Inactivo'}
                </label>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label">Tipo de identificación</label>
              <select
                className="input"
                value={idType}
                onChange={e => setIdType(e.target.value as IdType)}
              >
                <option value="NIT">NIT</option>
                <option value="CC">CC</option>
                <option value="PASSPORT">Pasaporte</option>
                <option value="OTHER">Otro</option>
              </select>
              {personKind === 'NATURAL' && idType === 'NIT' && (
                <p className="text-xs text-amber-600 mt-1">
                  Permitido: persona natural con NIT.
                </p>
              )}
            </div>

            <div>
              <label className="label">Documento</label>
              <input
                className="input"
                placeholder={documentPlaceholder}
                value={document_}
                onChange={e => setDocument(e.target.value.toUpperCase())}
              />
            </div>

            <div>
              <label className="label">Nombre / Razón social</label>
              <input
                className="input"
                placeholder={
                  personKind === 'JURIDICAL' ? 'Razón social' : 'Nombre completo'
                }
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
          </div>

          {personKind === 'JURIDICAL' && (
            <div className="space-y-4">
              <div>
                <label className="label">Representante legal (opcional)</label>
                <input
                  className="input"
                  placeholder="Nombre del representante legal"
                  value={legalRepName}
                  onChange={e => setLegalRepName(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Responsabilidades</label>
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {RESPONSIBILITY_OPTIONS.map(opt => (
                    <label
                      key={opt}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-white"
                    >
                      <input
                        type="checkbox"
                        className="checkbox checkbox-sm"
                        checked={responsibilities.includes(opt)}
                        onChange={() => toggleResponsibility(opt)}
                      />
                      <span className="text-sm">{opt}</span>
                    </label>
                  ))}
                </div>
                {responsibilities.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Seleccionadas:{' '}
                    <span className="font-medium">
                      {responsibilities.join(', ')}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="label">Correo</label>
              <input
                type="email"
                className="input"
                placeholder="tercero@correo.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input
                className="input"
                placeholder="+57 ..."
                value={phone}
                onChange={e => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Ciudad</label>
              <input
                className="input"
                placeholder="Bogotá"
                value={city}
                onChange={e => setCity(e.target.value)}
              />
            </div>

            {/* Payroll applicability for employees */}
            {roles.includes('EMPLOYEE') && (
              <div className="md:col-span-3">
                <label className="label">Aplicación en nómina (empleado)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={appliesSalary} onChange={e => setAppliesSalary(e.target.checked)} /> Sueldos y salarios</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={appliesWithholding} onChange={e => setAppliesWithholding(e.target.checked)} /> 237005 Retención en la fuente</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={appliesEps} onChange={e => setAppliesEps(e.target.checked)} /> 237010 Aportes EPS</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={appliesPension} onChange={e => setAppliesPension(e.target.checked)} /> 237015 Aportes pensión</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={appliesArl} onChange={e => setAppliesArl(e.target.checked)} /> 237020 ARL</label>
                  <label className="inline-flex items-center gap-2"><input type="checkbox" checked={appliesCcf} onChange={e => setAppliesCcf(e.target.checked)} /> 237025 Caja de Compensación</label>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label">Dirección</label>
            <input
              className="input"
              placeholder="Calle 123 #45-67"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Perfil fiscal</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Perfil tributario</label>
                <select
                  className="input"
                  value={taxProfile}
                  onChange={e => setTaxProfile(e.target.value as TaxProfile)}
                >
                  {TAX_PROFILE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Régimen fiscal</label>
                <select
                  className="input"
                  value={fiscalRegime}
                  onChange={e => setFiscalRegime(e.target.value as FiscalRegime)}
                >
                  {FISCAL_REGIME_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3">
                <label className="label flex-1">Agente retenedor</label>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={isWithholdingAgent}
                  onChange={e => setWithholdingAgent(e.target.checked)}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Código CIIU</label>
                <input
                  className="input"
                  placeholder="Ej: 1071"
                  value={ciiuCode}
                  onChange={e =>
                    setCiiuCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^0-9A-Z]/g, '')
                        .slice(0, 8),
                    )
                  }
                />
              </div>

              <div>
                <label className="label">Municipio (DIVIPOLA)</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchSelect
                      value={municipalityCode || ''}
                      options={municipalityOptions}
                      onSelect={opt => {
                        if (opt) {
                          const code = String(opt.value)
                          const match = municipalities.find(m => m.code === code) ?? null
                          setSelectedMunicipality(match)
                          setMunicipalityCode(code)
                        } else {
                          setSelectedMunicipality(null)
                          setMunicipalityCode('')
                        }
                        setMunicipalitySearchText('')
                      }}
                      onInputChange={text => setMunicipalitySearchText(text)}
                      placeholder="Buscar municipio por nombre o código"
                    />
                  </div>
                  {municipalityCode && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setMunicipalityCode('')
                        setSelectedMunicipality(null)
                        setMunicipalitySearchText('')
                      }}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
                {selectedMunicipality && (
                  <p className="text-xs text-gray-500 mt-1">
                    {selectedMunicipality.name}{' '}
                    <span className="text-gray-400">
                      ({selectedMunicipality.departmentName})
                    </span>
                  </p>
                )}
                {municipalityLoading && (
                  <p className="text-xs text-gray-400 mt-1">
                    Buscando municipios…
                  </p>
                )}
                {municipalityError && (
                  <p className="text-xs text-red-600 mt-1">{municipalityError}</p>
                )}
              </div>

              <div>
                <label className="label">IVA por defecto</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchSelect
                      value={defaultVatId ?? ''}
                      options={vatOptions}
                      onSelect={opt =>
                        setDefaultVatId(
                          opt ? Number(opt.value) : null,
                        )
                      }
                      placeholder={
                        taxProfile === 'IVA_RESPONSABLE'
                          ? 'Buscar impuesto (IVA)'
                          : 'No aplica'
                      }
                      disabled={taxProfile !== 'IVA_RESPONSABLE'}
                    />
                  </div>
                  {defaultVatId != null && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setDefaultVatId(null)}
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Condiciones comerciales y cuentas</h2>
            

            {(roles.includes('CLIENT') ||
              roles.includes('PROVIDER') ||
              roles.includes('EMPLOYEE') ||
              roles.includes('OTHER')) && (
              <div className="space-y-4 rounded-lg border border-base-300 bg-base-100 p-4">
                <h3 className="text-sm font-semibold text-gray-700">
                  Cuentas específicas por rol
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  {roles.includes('CLIENT') && (
                    <div>
                      <label className="label">Cuenta por cobrar (ventas · Cliente)</label>
                      <SearchSelect
                        value={clientReceivableAccountCode || ''}
                        options={receivableAccountOptions}
                        onSelect={opt =>
                          setClientReceivableAccountCode(opt ? String(opt.value) : '')
                        }
                        placeholder="Cuenta por cobrar para ventas"
                        noResultsText="No hay cuentas CxC habilitadas"
                      />
                      {selectedClientReceivable && (
                        <p className="text-xs text-gray-500 mt-1">
                          {selectedClientReceivable.name}
                        </p>
                      )}
                    </div>
                  )}

                  {roles.includes('PROVIDER') && (
                    <div>
                      <label className="label">Cuenta por pagar (compras · Proveedor)</label>
                      <SearchSelect
                        value={providerPayableAccountCode || ''}
                        options={payableAccountOptions}
                        onSelect={opt =>
                          setProviderPayableAccountCode(opt ? String(opt.value) : '')
                        }
                        placeholder="Cuenta por pagar para compras"
                        noResultsText="No hay cuentas CxP habilitadas"
                      />
                      {selectedProviderPayable && (
                        <p className="text-xs text-gray-500 mt-1">
                          {selectedProviderPayable.name}
                        </p>
                      )}
                    </div>
                  )}

                  {roles.includes('EMPLOYEE') && (
                    <div>
                      <label className="label">Cuenta por pagar (pagos · Empleado)</label>
                      <SearchSelect
                        value={employeePayableAccountCode || ''}
                        options={payableAccountOptions}
                        onSelect={opt =>
                          setEmployeePayableAccountCode(opt ? String(opt.value) : '')
                        }
                        placeholder="Cuenta por pagar para nómina"
                        noResultsText="No hay cuentas CxP habilitadas"
                      />
                      {selectedEmployeePayable && (
                        <p className="text-xs text-gray-500 mt-1">
                          {selectedEmployeePayable.name}
                        </p>
                      )}
                    </div>
                  )}

                  {roles.includes('OTHER') && (
                    <>
                      <div>
                        <label className="label">Cuenta por cobrar (otros roles)</label>
                        <SearchSelect
                          value={otherReceivableAccountCode || ''}
                          options={receivableAccountOptions}
                          onSelect={opt =>
                            setOtherReceivableAccountCode(opt ? String(opt.value) : '')
                          }
                          placeholder="Cuenta por cobrar para otros"
                          noResultsText="No hay cuentas CxC habilitadas"
                        />
                        {selectedOtherReceivable && (
                          <p className="text-xs text-gray-500 mt-1">
                            {selectedOtherReceivable.name}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="label">Cuenta por pagar (otros roles)</label>
                        <SearchSelect
                          value={otherPayableAccountCode || ''}
                          options={payableAccountOptions}
                          onSelect={opt =>
                            setOtherPayableAccountCode(opt ? String(opt.value) : '')
                          }
                          placeholder="Cuenta por pagar para otros"
                          noResultsText="No hay cuentas CxP habilitadas"
                        />
                        {selectedOtherPayable && (
                          <p className="text-xs text-gray-500 mt-1">
                            {selectedOtherPayable.name}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Estas cuentas se usan cuando el movimiento contable coincide con el rol seleccionado.
                </p>
              </div>
            )}
          </div>

          {metaLoading && (
            <div className="rounded-lg border border-info bg-blue-50 p-3 text-sm text-blue-700">
              Cargando cuentas e impuestos…
            </div>
          )}

          {metaError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
              {metaError}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Link href="/parties" className="btn">
              Cancelar
            </Link>
            <button
              type="button"
              className="btn"
              disabled={saving}
              onClick={() => submit(false)}
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => submit(true)}
              title="Guardar y crear una factura para este tercero"
            >
              {saving ? 'Guardando…' : 'Guardar y facturar'}
            </button>
          </div>
        </form>
      </main>
    </Protected>
  )
}
