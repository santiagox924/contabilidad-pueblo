'use client'

import { RESPONSIBILITY_OPTIONS } from '../constants'
import { useInvoiceForm } from '../context/InvoiceFormContext'
import SearchSelect from '@/components/SearchSelect'

export default function ClientSection() {
  const {
    parties,
    thirdPartyId,
    setThirdPartyId,
    partyFound,
    setPartyFound,
    doc,
    setDoc,
    lookupByDocument,
    searching,
    personKind,
    setPersonKind,
    idType,
    setIdType,
    legalRepName,
    setLegalRepName,
    responsibilities,
    setResponsibilities,
    name,
    setName,
    email,
    setEmail,
    phone,
    setPhone,
    address,
    setAddress,
    city,
    setCity,
    documentPlaceholder,
  } = useInvoiceForm()

  // Helper para resetear campos cuando cambiamos de selección o limpiamos
  function resetPartyFields() {
    setThirdPartyId('' as any)
    setPartyFound(null as any)
    setDoc('')
    setPersonKind('NATURAL' as any)
    setIdType('CC' as any)
    setLegalRepName('')
    setResponsibilities([])
    setName('')
    setEmail('')
    setPhone('')
    setAddress('')
    setCity('')
  }

  return (
    <div className="space-y-4">
      {/* Persona e identificación */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="label">Persona</label>
          <select
            className="input"
            value={personKind}
            onChange={(e) => setPersonKind(e.target.value as any)}
            disabled={!!partyFound}
          >
            <option value="NATURAL">Natural</option>
            <option value="JURIDICAL">Jurídica</option>
          </select>
        </div>

        <div>
          <label className="label">Tipo de identificación</label>
          <select
            className="input"
            value={idType}
            onChange={(e) => setIdType(e.target.value as any)}
            disabled={!!partyFound}
          >
            <option value="NIT">NIT</option>
            <option value="CC">CC</option>
            <option value="PASSPORT">Pasaporte</option>
            <option value="OTHER">Otro</option>
          </select>
        </div>

        <div>
          <label className="label">Documento</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input w-full"
              placeholder={documentPlaceholder}
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              onBlur={() => lookupByDocument(doc)}
              disabled={!!partyFound}
            />
            <button
              type="button"
              className="btn"
              onClick={() => lookupByDocument(doc)}
              disabled={searching || !!partyFound}
              title="Buscar por documento"
            >
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
        </div>
      </div>

      {/* Representante legal y responsabilidades */}
      {personKind === 'JURIDICAL' && (
        <>
          <div>
            <label className="label">Representante legal (opcional)</label>
            <input
              className="input"
              placeholder="Representante legal"
              value={legalRepName}
              onChange={(e) => setLegalRepName(e.target.value)}
              disabled={!!partyFound}
            />
          </div>

          <div>
            <label className="label">Responsabilidades</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {RESPONSIBILITY_OPTIONS.map((opt) => (
                <label key={opt} className="flex items-center gap-2 rounded-lg border p-2">
                  <input
                    type="checkbox"
                    className="checkbox"
                    disabled={!!partyFound}
                    checked={responsibilities.includes(opt)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setResponsibilities((prev) =>
                        checked
                          ? [...new Set([...prev, opt])]
                          : prev.filter((x) => x !== opt)
                      )
                    }}
                  />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Buscador de cliente existente (con opción de crear al vuelo) */}
      <div>
        <label className="block text-sm font-medium mb-1">Cliente (buscador)</label>
        <SearchSelect
          disabled={!!partyFound}
          value={thirdPartyId || ''}
          options={(parties as any[]).map((p: any) => ({
            value: p.id,
            label: p.name,
            sublabel: [p.document, p.city].filter(Boolean).join(' • '),
          }))}
          placeholder="Escribe nombre, documento o ciudad…"
          // 🔵 si selecciona un existente
          onSelect={(opt) => {
            if (!opt) {
              resetPartyFields()
              return
            }
            const p = (parties as any[]).find((pp: any) => String(pp.id) === String(opt.value)) || null
            setThirdPartyId(Number(opt.value) as any)
            setPartyFound(p as any)
            if (p) {
              setDoc(p.document || '')
              setPersonKind((p.personKind as any) ?? 'NATURAL')
              setIdType((p.idType as any) ?? 'CC')
              setLegalRepName((p as any).legalRepName ?? '')
              setResponsibilities(
                Array.isArray((p as any).responsibilities) ? (p as any).responsibilities : []
              )
              setName(p.name || '')
              setEmail(p.email || '')
              setPhone(p.phone || '')
              setAddress(p.address || '')
              setCity(p.city || '')
            }
          }}
          // 🔵 nuevas capacidades del SearchSelect
          allowCustom
          // Se dispara cuando el usuario presiona Enter sin coincidencias o clic en "Crear “texto”"
          onCustom={(label) => {
            // Limpiamos selección previa y marcamos que NO hay party encontrado
            setThirdPartyId('' as any)
            setPartyFound(null as any)
            // Dejamos el nombre exactamente como lo escribió el usuario
            setName(label)
            // No forzamos otros campos; el usuario los completa o se crean al guardar
          }}
          // Mientras escribe, si no hay party seleccionado, sincronizamos con el campo Nombre
          onInputChange={(text) => {
            if (!partyFound) {
              setName(text)
              // Asegura que no quede un id seleccionado
              setThirdPartyId('' as any)
            }
          }}
        />
        {!!partyFound && (
          <p className="text-xs text-gray-500 mt-1">
            Deshabilitado porque el cliente fue seleccionado por documento o preseleccionado desde terceros.
          </p>
        )}
      </div>

      {/* Datos de contacto */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nombre / Razón social</label>
          <input
            type="text"
            className="input input-bordered w-full rounded-xl"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={personKind === 'JURIDICAL' ? 'Razón social' : 'Nombre completo'}
            disabled={!!partyFound}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Correo</label>
          <input
            type="email"
            className="input input-bordered w-full rounded-xl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@correo.com"
            disabled={!!partyFound}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Teléfono</label>
          <input
            type="text"
            className="input input-bordered w-full rounded-xl"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+57 ..."
            disabled={!!partyFound}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Dirección</label>
          <input
            type="text"
            className="input input-bordered w-full rounded-xl"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Calle 123 #45-67"
            disabled={!!partyFound}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Ciudad</label>
          <input
            type="text"
            className="input input-bordered w-full rounded-xl"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Bogotá"
            disabled={!!partyFound}
          />
        </div>
      </div>
    </div>
  )
}
