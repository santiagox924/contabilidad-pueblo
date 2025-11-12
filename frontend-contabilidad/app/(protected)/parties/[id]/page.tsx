'use client'

import Navbar from '@/components/Navbar'
import Protected from '@/components/Protected'
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
import { searchMunicipalities, getMunicipalityByCode, type Municipality } from '@/lib/municipalities'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

type PersonKind = 'NATURAL' | 'JURIDICAL'
type IdType = 'NIT' | 'CC' | 'PASSPORT' | 'OTHER'

type Party = {
  id: number
  name: string
  type: PartyType
  roles?: PartyType[] | null
  personKind: PersonKind
  idType: IdType
  legalRepName?: string | null
  document?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  active?: boolean | null
  responsibilities?: string[] | null
  paymentTermsDays?: number | null
  fiscalRegime?: FiscalRegime | null
  isWithholdingAgent?: boolean | null
  ciiuCode?: string | null
  municipalityCode?: string | null
  taxProfile?: TaxProfile | null
  defaultVatId?: number | null
  receivableAccountCode?: string | null
  payableAccountCode?: string | null
  clientReceivableAccountCode?: string | null
  providerPayableAccountCode?: string | null
  employeePayableAccountCode?: string | null
  otherReceivableAccountCode?: string | null
  otherPayableAccountCode?: string | null
}

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

export default function EditPartyPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = Number(params.id)

  const [loaded, setLoaded] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [metaLoading, setMetaLoading] = useState(true)
  const [metaError, setMetaError] = useState<string | null>(null)

  const [roles, setRoles] = useState<PartyType[]>(['CLIENT'])
  const [personKind, setPersonKind] = useState<PersonKind>('NATURAL')
  const [idType, setIdType] = useState<IdType>('CC')
  const [document_, setDocument] = useState('')

  const [name, setName] = useState('')
  const [legalRepName, setLegalRepName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [active, setActive] = useState(true)
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

  const [accounts, setAccounts] = useState<Account[]>([])
  const [taxes, setTaxes] = useState<Tax[]>([])
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null)
  const [municipalitySearchText, setMunicipalitySearchText] = useState('')
  const [municipalityLoading, setMunicipalityLoading] = useState(false)
  const [municipalityError, setMunicipalityError] = useState<string | null>(null)
  const municipalityAbortRef = useRef<AbortController | null>(null)
  const municipalityDebounceRef = useRef<NodeJS.Timeout | null>(null)

  const normalizeRolesSelection = (list: PartyType[]): PartyType[] => {
    const ordered: PartyType[] = []
    for (const role of list) {
      if (!PARTY_TYPES.includes(role)) continue
      if (!ordered.includes(role)) ordered.push(role)
    }
    if (!ordered.length) ordered.push('OTHER')
    return ordered
  }

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
    (async () => {
      setErr(null)
      try {
        const res = await api.get(`/parties/${id}`)
        const p = (res && 'data' in res ? (res as any).data : res) as Party
        const normalizedRoles = normalizeRolesSelection(
          Array.isArray(p.roles) && p.roles.length
            ? (p.roles as PartyType[])
            : [p.type ?? 'CLIENT'],
        )
        setRoles(normalizedRoles)
        setPersonKind(p.personKind ?? 'NATURAL')
        setIdType(p.idType ?? (p.personKind === 'JURIDICAL' ? 'NIT' : 'CC'))
        setDocument(p.document ?? '')
        setName(p.name ?? '')
        setLegalRepName(p.legalRepName ?? '')
        setEmail(p.email ?? '')
        setPhone(p.phone ?? '')
        setAddress(p.address ?? '')
        setCity(p.city ?? '')
        setActive(p.active !== false)
        setResponsibilities(
          Array.isArray(p.responsibilities) ? p.responsibilities : [],
        )
        
        setFiscalRegime(p.fiscalRegime ?? 'RESPONSABLE_IVA')
        setWithholdingAgent(Boolean(p.isWithholdingAgent))
        setCiiuCode(p.ciiuCode ?? '')
        setMunicipalityCode(p.municipalityCode ?? '')
        setSelectedMunicipality(null)
        setMunicipalitySearchText('')
        setTaxProfile(p.taxProfile ?? 'NA')
        setDefaultVatId(p.defaultVatId ?? null)
        setReceivableAccountCode(p.receivableAccountCode ?? '')
        setPayableAccountCode(p.payableAccountCode ?? '')
        setClientReceivableAccountCode(p.clientReceivableAccountCode ?? '')
        setProviderPayableAccountCode(p.providerPayableAccountCode ?? '')
        setEmployeePayableAccountCode(p.employeePayableAccountCode ?? '')
        setOtherReceivableAccountCode(p.otherReceivableAccountCode ?? '')
        setOtherPayableAccountCode(p.otherPayableAccountCode ?? '')
        setLoaded(true)
      } catch (e: any) {
        setErr(e?.message ?? 'No se pudo cargar el tercero')
      }
    })()
  }, [id])

  useEffect(() => {
    if (taxProfile !== 'IVA_RESPONSABLE') {
      setDefaultVatId(null)
    }
  }, [taxProfile])

  useEffect(() => {
    if (!loaded) return

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

  }, [
    roles,
    loaded,
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
    const options = accounts
      .filter(isReceivableAccountEligible)
      .map(accountToOption)

    const requiredCodes = Array.from(
      new Set(
        [
          receivableAccountCode,
          clientReceivableAccountCode,
          otherReceivableAccountCode,
        ].filter((code): code is string => Boolean(code?.trim())),
      ),
    )

    for (const code of requiredCodes) {
      if (!options.some(opt => String(opt.value) === code)) {
        const existing = accounts.find(acc => acc.code === code)
        if (existing) {
          const option = accountToOption(existing)
          option.sublabel = option.sublabel
            ? `${option.sublabel} · ⚠ Fuera de categoría`
            : '⚠ Fuera de categoría'
          options.unshift(option)
        }
      }
    }

    return options
  }, [
    accounts,
    receivableAccountCode,
    clientReceivableAccountCode,
    otherReceivableAccountCode,
  ])

  const payableAccountOptions = useMemo(() => {
    const options = accounts
      .filter(isPayableAccountEligible)
      .map(accountToOption)

    const requiredCodes = Array.from(
      new Set(
        [
          payableAccountCode,
          providerPayableAccountCode,
          employeePayableAccountCode,
          otherPayableAccountCode,
        ].filter((code): code is string => Boolean(code?.trim())),
      ),
    )

    for (const code of requiredCodes) {
      if (!options.some(opt => String(opt.value) === code)) {
        const existing = accounts.find(acc => acc.code === code)
        if (existing) {
          const option = accountToOption(existing)
          option.sublabel = option.sublabel
            ? `${option.sublabel} · ⚠ Fuera de categoría`
            : '⚠ Fuera de categoría'
          options.unshift(option)
        }
      }
    }

    return options
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

  const generalReceivableAccount = useMemo(() => {
    const code = receivableAccountCode.trim()
    return code ? accounts.find(acc => acc.code === code) ?? null : null
  }, [accounts, receivableAccountCode])

  const generalPayableAccount = useMemo(() => {
    const code = payableAccountCode.trim()
    return code ? accounts.find(acc => acc.code === code) ?? null : null
  }, [accounts, payableAccountCode])

  const primaryRole = roles[0] ?? 'OTHER'

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

  const hasResp = (opt: string) =>
    responsibilities.some(r => (r ?? '').toLowerCase() === opt.toLowerCase())

  function toggleResponsibility(tag: string) {
    setResponsibilities(prev =>
      hasResp(tag)
        ? prev.filter(t => (t ?? '').toLowerCase() !== tag.toLowerCase())
        : [...prev, tag],
    )
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErr(null)
    setSaving(true)
    try {
      if (!name.trim()) throw new Error('Ingresa el nombre / razón social')
    
      if (ciiuCode && ciiuCode.length < 3) {
        throw new Error('El código CIIU debe tener al menos 3 caracteres')
      }
      if (municipalityCode && municipalityCode.length !== 5) {
        throw new Error('El código de municipio debe tener 5 dígitos')
      }
      if (!roles.length) {
        throw new Error('Selecciona al menos un rol')
      }

      await api.put(`/parties/${id}`, {
        type: primaryRole,
        roles,
        personKind,
        idType,
        legalRepName:
          personKind === 'JURIDICAL'
            ? legalRepName.trim() || null
            : null,
        responsibilities:
          personKind === 'JURIDICAL'
            ? responsibilities
            : [],
        document: document_.trim() || null,
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        city: city.trim() || null,
        active,
        
        fiscalRegime,
        isWithholdingAgent,
        ciiuCode: ciiuCode.trim()
          ? ciiuCode.trim().toUpperCase()
          : null,
        municipalityCode: municipalityCode.trim() || null,
        taxProfile,
        defaultVatId:
          taxProfile === 'IVA_RESPONSABLE'
            ? defaultVatId ?? null
            : null,
        receivableAccountCode: receivableAccountCode.trim()
          ? receivableAccountCode.trim()
          : null,
        payableAccountCode: payableAccountCode.trim()
          ? payableAccountCode.trim()
          : null,
        clientReceivableAccountCode: roles.includes('CLIENT')
          ? clientReceivableAccountCode.trim() || null
          : null,
        providerPayableAccountCode: roles.includes('PROVIDER')
          ? providerPayableAccountCode.trim() || null
          : null,
        employeePayableAccountCode: roles.includes('EMPLOYEE')
          ? employeePayableAccountCode.trim() || null
          : null,
        otherReceivableAccountCode: roles.includes('OTHER')
          ? otherReceivableAccountCode.trim() || null
          : null,
        otherPayableAccountCode: roles.includes('OTHER')
          ? otherPayableAccountCode.trim() || null
          : null,
      })

      router.push('/parties')
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'No se pudo actualizar'
      setErr(Array.isArray(msg) ? msg.join(', ') : String(msg))
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
            <h1 className="text-2xl font-semibold">Editar tercero</h1>
            <p className="text-sm text-gray-500">
              Actualiza la información del tercero.
            </p>
          </div>
          <a className="btn" href="/parties">
            Volver
          </a>
        </div>

        {!loaded ? (
          <div className="card text-sm text-gray-600">Cargando…</div>
        ) : (
          <form onSubmit={submit} className="card space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="label">Roles del tercero</label>
                <div className="flex flex-wrap gap-2">
                  {PARTY_TYPES.map(role => {
                    const checked = roles.includes(role)
                    const isPrimary = role === primaryRole
                    const checkboxId = `party-${id}-role-${role.toLowerCase()}`
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
                  Puedes asignar varios roles. El rol principal define las cuentas y parámetros por defecto.
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
                    personKind === 'JURIDICAL'
                      ? 'Razón social'
                      : 'Nombre completo'
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
                          checked={hasResp(opt)}
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
                    <p className="text-xs text-gray-400 mt-1">Buscando municipios…</p>
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
                          setDefaultVatId(opt ? Number(opt.value) : null)
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
              

              <p className="text-xs text-gray-500">
                Las cuentas generales se calculan con las selecciones por rol. CxC:{' '}
                <span className="font-medium">
                  {receivableAccountCode.trim() || '—'}
                </span>
                {generalReceivableAccount && ` · ${generalReceivableAccount.name}`} · CxP:{' '}
                <span className="font-medium">
                  {payableAccountCode.trim() || '—'}
                </span>
                {generalPayableAccount && ` · ${generalPayableAccount.name}`}
              </p>

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

            {err && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {err}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <a className="btn" href="/parties">
                Cancelar
              </a>
              <button className="btn btn-primary" disabled={saving}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </main>
    </Protected>
  )
}
