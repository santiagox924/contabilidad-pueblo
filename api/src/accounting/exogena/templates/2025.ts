// api/src/accounting/exogena/templates/2025.ts
// Copia base 2025 (puedes modificar campos según la resolución 2025 de la DIAN)

import { Template2024 } from './2024';
import type { ExogenaYearTemplate } from './types';

export const Template2025: ExogenaYearTemplate = {
  year: 2025,
  // Por ahora reusamos los mismos mapas que 2024; ajusta cuando cambien estructuras.
  formats: { ...Template2024.formats },
};
