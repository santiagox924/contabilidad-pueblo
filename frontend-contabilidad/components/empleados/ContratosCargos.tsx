"use client"
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export type Contract = {
  id: number;
  type: string;
  startDate: string;
  endDate?: string;
  position: string;
  salary: number;
};
export type Position = { id: number; name: string };

// Gestión de contratos, cargos, salario, fechas, tipo de vinculación
export default function ContratosCargos() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    (async () => {
      const resContracts = await api.get('/contracts');
      setContracts(Array.isArray(resContracts.data) ? resContracts.data : []);
      const resPositions = await api.get('/positions');
      setPositions(Array.isArray(resPositions.data) ? resPositions.data : []);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Contratos y cargos</h1>
      <h2 className="font-semibold mb-2">Contratos</h2>
      {contracts.length === 0 ? (
        <div className="p-4 bg-gray-50 rounded">No hay contratos registrados.</div>
      ) : (
        <div className="overflow-x-auto mb-4">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Tipo</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Cargo</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Salario</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Inicio</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Fin</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contracts.map(c => (
                <tr key={c.id}>
                  <td className="px-4 py-2 text-sm">{c.type}</td>
                  <td className="px-4 py-2 text-sm">{c.position}</td>
                  <td className="px-4 py-2 text-sm text-right">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(c.salary)}</td>
                  <td className="px-4 py-2 text-sm">{new Date(c.startDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-sm">{c.endDate ? new Date(c.endDate).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h2 className="font-semibold mb-2">Cargos</h2>
      <ul className="mb-4">
        {positions.map(p => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
      {/* Formulario para agregar contrato/cargo (próximamente) */}
    </div>
  );
}
