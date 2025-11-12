// app/(protected)/accounts/page.tsx
"use client";

import Protected from "@/components/Protected";
import Navbar from "@/components/Navbar";
import axios, { AxiosError } from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Account,
  AccountType,
  CreateAccountInput,
  FlowType,
  TaxProfile,
} from "@/lib/accounts";
import {
  listAccounts,
  createAccount,
  inferLevelFromCode,
  inferParentFromCode,
} from "@/lib/accounts";
import { USER_ROLES } from "@/lib/roles";

// Si usas shadcn/ui, puedes reemplazar los <button>/<input> por sus componentes.
// Este archivo está escrito solo con HTML + Tailwind para que funcione out-of-the-box.

const ACCOUNT_TYPES: { label: string; value: AccountType }[] = [
  { label: "Activo", value: "ASSET" },
  { label: "Pasivo", value: "LIABILITY" },
  { label: "Patrimonio", value: "EQUITY" },
  { label: "Ingresos", value: "REVENUE" },
  { label: "Gastos", value: "EXPENSE" },
];

const NATURE_LABELS: Record<Account["nature"], string> = {
  D: "Débito",
  C: "Crédito",
};

const FLOW_TYPES: { label: string; value: FlowType }[] = [
  { label: "Ninguno", value: "NONE" },
  { label: "Cuentas por cobrar", value: "AR" },
  { label: "Cuentas por pagar", value: "AP" },
];

const FLOW_TYPE_BADGES: Record<FlowType, string> = {
  NONE: "Ninguno",
  AR: "CxC",
  AP: "CxP",
};

const TAX_PROFILES: { label: string; value: TaxProfile }[] = [
  { label: "N/A", value: "NA" },
  { label: "IVA Responsable", value: "IVA_RESPONSABLE" },
  { label: "Exento", value: "EXENTO" },
  { label: "Excluido", value: "EXCLUIDO" },
];

const TAX_PROFILE_LABELS: Record<TaxProfile, string> = Object.fromEntries(
  TAX_PROFILES.map((entry) => [entry.value, entry.label])
) as Record<TaxProfile, string>;

export default function AccountsPage() {
  const [data, setData] = useState<Account[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros simples
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | AccountType>("");

  // Formulario de creación
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("ASSET");
  const [parentCode, setParentCode] = useState("");
  const [nature, setNature] = useState<"D" | "C">("D");
  const [current, setCurrent] = useState<boolean>(true);
  const [reconcilable, setReconcilable] = useState<boolean>(false);
  const [isBank, setIsBank] = useState<boolean>(false);
  const [isCash, setIsCash] = useState<boolean>(false);
  const [isDetailed, setIsDetailed] = useState<boolean>(true);
  const [requiresThirdParty, setRequiresThirdParty] = useState<boolean>(false);
  const [requiresCostCenter, setRequiresCostCenter] = useState<boolean>(false);
  const [flowType, setFlowType] = useState<FlowType>("NONE");
  const [taxProfile, setTaxProfile] = useState<TaxProfile>("NA");
  const [vatRate, setVatRate] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [openForm, setOpenForm] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  // Carga inicial
  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      try {
        const items = await listAccounts(abortRef.current.signal);
        setData(items);
      } catch (e: any) {
        if (axios.isCancel?.(e) || e?.code === AxiosError.ERR_CANCELED || e?.name === "CanceledError") {
          return;
        }
        setError(e?.message || "No se pudo cargar el plan de cuentas.");
      } finally {
        setLoading(false);
      }
    })();

    return () => abortRef.current?.abort();
  }, []);

  // Autocompletar parentCode al escribir el code
  useEffect(() => {
    const inferred = inferParentFromCode(code.trim());
    // Solo sugerimos si el usuario no tocó manualmente el campo
    if (!parentCode) setParentCode(inferred || "");
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (type === "ASSET" || type === "EXPENSE") {
      setNature("D");
    } else {
      setNature("C");
    }
  }, [type]);

  useEffect(() => {
    if (isBank) {
      setReconcilable(true);
      if (isCash) setIsCash(false);
    }
  }, [isBank]);

  useEffect(() => {
    if (isCash && isBank) {
      setIsBank(false);
    }
  }, [isCash, isBank]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.filter((acc) => {
      const matchesTerm =
        !term ||
        acc.code.toLowerCase().includes(term) ||
        acc.name.toLowerCase().includes(term);
      const matchesType = !typeFilter || acc.type === typeFilter;
      return matchesTerm && matchesType;
    });
  }, [data, q, typeFilter]);

  const grouped = useMemo(() => {
    // Agrupa por tipo para una lectura más cómoda
    const byType = new Map<AccountType, Account[]>();
    for (const t of ACCOUNT_TYPES.map((x) => x.value)) byType.set(t, []);
    for (const acc of filtered) {
      byType.get(acc.type)?.push(acc);
    }
    for (const [k, arr] of byType) {
      arr.sort((a, b) =>
        a.code.localeCompare(b.code, undefined, { numeric: true })
      );
      byType.set(k, arr);
    }
    return byType;
  }, [filtered]);

  async function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const payload: CreateAccountInput = {
        code: code.trim(),
        name: name.trim(),
        type,
        parentCode: parentCode.trim() || undefined,
        nature,
        current,
        reconcilable,
        isBank,
        isCash,
        isDetailed,
        requiresThirdParty,
        requiresCostCenter,
        flowType,
        taxProfile,
        vatRate: vatRate === "" ? undefined : Number(vatRate),
      };

      // Validaciones mínimas
      if (!payload.code) throw new Error("El código es obligatorio.");
      if (!payload.name) throw new Error("El nombre es obligatorio.");
      if (payload.isBank && payload.isCash) {
        throw new Error("Una cuenta no puede ser banco y caja al mismo tiempo.");
      }
      if (payload.vatRate != null && Number.isNaN(payload.vatRate)) {
        throw new Error("El IVA debe ser un número válido.");
      }

      const created = await createAccount(payload);
      // Insertar y resortear localmente
      setData((prev) => {
        const next = [...prev, created];
        next.sort((a, b) =>
          a.code.localeCompare(b.code, undefined, { numeric: true })
        );
        return next;
      });

      // Reset
      setCode("");
      setName("");
      setParentCode("");
      setType("ASSET");
      setNature("D");
      setCurrent(true);
      setReconcilable(false);
      setIsBank(false);
      setIsCash(false);
      setIsDetailed(true);
      setRequiresThirdParty(false);
      setRequiresCostCenter(false);
      setFlowType("NONE");
      setTaxProfile("NA");
      setVatRate("");
      setOpenForm(false);
    } catch (e: any) {
      setError(e?.message || "No se pudo crear la cuenta.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Protected
      roles={[
        USER_ROLES.ACCOUNTING_ADMIN,
        USER_ROLES.ACCOUNTANT,
        USER_ROLES.ACCOUNTING_ASSISTANT,
        USER_ROLES.SUPER_ADMIN,
      ]}
    >
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Plan de cuentas</h1>
          <p className="text-sm text-gray-500">
            Crea y administra las cuentas contables. Los cambios son inmediatos.
          </p>
        </div>

        <button
          onClick={() => setOpenForm((v) => !v)}
          className="rounded-2xl border px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
        >
          {openForm ? "Cerrar" : "Nueva cuenta"}
        </button>
      </header>

      {/* Formulario de creación */}
      {openForm && (
        <div className="mb-6 rounded-2xl border bg-white p-4 shadow-sm">
          <form onSubmit={onCreate} className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-3">
              <label className="mb-1 block text-sm font-medium">Código</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Ej: 1.1.01"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
              />
              <p className="mt-1 text-xs text-gray-500">
                Nivel: {inferLevelFromCode(code || "")}
              </p>
            </div>

            <div className="md:col-span-5">
              <label className="mb-1 block text-sm font-medium">Nombre</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Caja general"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Tipo</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Naturaleza</label>
              <select
                value={nature}
                onChange={(e) => setNature(e.target.value as "D" | "C")}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
              >
                <option value="D">Débito (D)</option>
                <option value="C">Crédito (C)</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Débito para activo/gasto, Crédito para pasivo/patrimonio/ingreso.
              </p>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">
                Cuenta padre (opcional)
              </label>
              <input
                value={parentCode}
                onChange={(e) => setParentCode(e.target.value)}
                placeholder="Ej: 1.1"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
                list="accounts-codes"
              />
              {/* datalist para autocompletar códigos existentes */}
              <datalist id="accounts-codes">
                {data.map((acc) => (
                  <option key={acc.code} value={acc.code} />
                ))}
              </datalist>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Flujo</label>
              <select
                value={flowType}
                onChange={(e) => setFlowType(e.target.value as FlowType)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
              >
                {FLOW_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="mb-1 block text-sm font-medium">Perfil fiscal</label>
              <select
                value={taxProfile}
                onChange={(e) => setTaxProfile(e.target.value as TaxProfile)}
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
              >
                {TAX_PROFILES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">IVA (%)</label>
              <input
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                placeholder="Ej: 19"
                type="number"
                step="0.01"
                className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
              />
              <p className="mt-1 text-xs text-gray-500">Déjalo vacío si no aplica.</p>
            </div>

            <div className="md:col-span-12 grid grid-cols-1 gap-2 rounded-xl border bg-gray-50 p-3 md:grid-cols-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={current}
                  onChange={(e) => setCurrent(e.target.checked)}
                />
                <span>Cuenta corriente</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reconcilable}
                  onChange={(e) => setReconcilable(e.target.checked)}
                />
                <span>Conciliable</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isDetailed}
                  onChange={(e) => setIsDetailed(e.target.checked)}
                />
                <span>Detallada (permite asientos)</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isCash}
                  onChange={(e) => setIsCash(e.target.checked)}
                />
                <span>Es caja</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isBank}
                  onChange={(e) => setIsBank(e.target.checked)}
                />
                <span>Es banco</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={requiresThirdParty}
                  onChange={(e) => setRequiresThirdParty(e.target.checked)}
                />
                <span>Exige tercero</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={requiresCostCenter}
                  onChange={(e) => setRequiresCostCenter(e.target.checked)}
                />
                <span>Exige centro de costo</span>
              </label>
            </div>

            <div className="md:col-span-12 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCode("");
                  setName("");
                  setParentCode("");
                  setType("ASSET");
                  setNature("D");
                  setCurrent(true);
                  setReconcilable(false);
                  setIsBank(false);
                  setIsCash(false);
                  setIsDetailed(true);
                  setRequiresThirdParty(false);
                  setRequiresCostCenter(false);
                  setFlowType("NONE");
                  setTaxProfile("NA");
                  setVatRate("");
                }}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
              >
                Limpiar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {creating ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Barra de filtros */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código o nombre…"
            className="w-64 rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AccountType | "")}
            className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
          >
            <option value="">Todos los tipos</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-sm text-gray-500">
          {loading
            ? "Cargando…"
            : `${filtered.length} / ${data.length} cuentas`}
        </div>
      </div>

      {/* Tabla agrupada por tipo */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 && !error && (
        <div className="rounded-xl border bg-white p-6 text-center text-sm text-gray-500">
          No hay resultados.
        </div>
      )}

      <div className="space-y-8">
        {ACCOUNT_TYPES.map(({ label, value }) => {
          const rows = grouped.get(value) || [];
          if (rows.length === 0) return null;
          return (
            <section key={value}>
              <h2 className="mb-2 text-lg font-semibold">{label}</h2>
              <div className="overflow-hidden rounded-2xl border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Código</th>
                      <th className="px-3 py-2 text-left font-medium">Nombre</th>
                      <th className="px-3 py-2 text-left font-medium">Padre</th>
                      <th className="px-3 py-2 text-left font-medium">Naturaleza</th>
                      <th className="px-3 py-2 text-left font-medium">Propiedades</th>
                      <th className="px-3 py-2 text-left font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((acc) => (
                      <tr key={acc.code} className="border-t">
                        <td className="px-3 py-2 font-mono tabular-nums">
                          {acc.code}
                        </td>
                        <td className="px-3 py-2">{acc.name}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {acc.parentCode || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-gray-600">
                          {NATURE_LABELS[acc.nature] ?? acc.nature}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                              Nivel {acc.level ?? inferLevelFromCode(acc.code)}
                            </span>
                            {acc.isDetailed ? (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">
                                Detallada
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">
                                No detallada
                              </span>
                            )}
                            {acc.isCash && (
                              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700">
                                Caja
                              </span>
                            )}
                            {acc.isBank && (
                              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">
                                Banco
                              </span>
                            )}
                            {acc.reconcilable && (
                              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[11px] text-purple-700">
                                Conciliable
                              </span>
                            )}
                            {acc.requiresThirdParty && (
                              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700">
                                Requiere tercero
                              </span>
                            )}
                            {acc.requiresCostCenter && (
                              <span className="rounded-full bg-lime-50 px-2 py-0.5 text-[11px] text-lime-700">
                                Requiere CCosto
                              </span>
                            )}
                            {acc.current && (
                              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                                Corriente
                              </span>
                            )}
                            {!acc.current && (
                              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-700">
                                No corriente
                              </span>
                            )}
                            {acc.flowType !== "NONE" && (
                              <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[11px] text-orange-700">
                                Flujo {FLOW_TYPE_BADGES[acc.flowType]}
                              </span>
                            )}
                            {acc.taxProfile !== "NA" && (
                              <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] text-yellow-700">
                                {TAX_PROFILE_LABELS[acc.taxProfile]}
                              </span>
                            )}
                            {acc.vatRate != null && (
                              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] text-teal-700">
                                IVA {acc.vatRate}%
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                              acc.isActive ?? true
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {(acc.isActive ?? true) ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
      </main>
    </Protected>
  );
}
