// api/src/common/fiscal/fiscal-mapping.ts
import { TaxProfile } from '@prisma/client';

/**
 * Devuelve la tarifa por defecto (en %) asociada a un perfil fiscal de IVA.
 * Ajusta las tasas según las reglas de tu negocio.
 */
export function taxProfileToDefaultRate(profile: TaxProfile): number {
  switch (profile) {
    case TaxProfile.IVA_RESPONSABLE:
      return 19;
    case TaxProfile.EXENTO:
      return 0;
    case TaxProfile.EXCLUIDO:
      return 0;
    case TaxProfile.NA:
    default:
      return 0;
  }
}
