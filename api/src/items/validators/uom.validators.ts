// api/src/items/validators/uom.validators.ts
import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Unit, UnitKind } from '@prisma/client';

/** Mismos mapas que usas en los DTOs */
const UNITS_BY_KIND: Record<UnitKind, Unit[]> = {
  COUNT: [Unit.UN, Unit.DZ, Unit.PKG, Unit.BOX, Unit.PR, Unit.ROLL],
  WEIGHT: [Unit.MG, Unit.G, Unit.KG, Unit.LB],
  VOLUME: [Unit.ML, Unit.L, Unit.M3, Unit.CM3, Unit.OZ_FL, Unit.GAL],
  LENGTH: [Unit.MM, Unit.CM, Unit.M, Unit.KM, Unit.IN, Unit.FT, Unit.YD],
  AREA: [Unit.CM2, Unit.M2, Unit.IN2, Unit.FT2, Unit.YD2],
};

const CANONICAL_BASE_BY_KIND: Record<UnitKind, Unit> = {
  COUNT: Unit.UN,
  WEIGHT: Unit.G,
  VOLUME: Unit.ML,
  LENGTH: Unit.MM,
  AREA: Unit.CM2,
};

function unitBelongsToKind(u: Unit | undefined, k: UnitKind | undefined) {
  if (!u || !k) return true;
  return UNITS_BY_KIND[k]?.includes(u) ?? false;
}

/**
 * Validador de clase: verifica coherencia entre unitKind/baseUnit/displayUnit.
 * Se usa como decorador **de propiedad** en el DTO (disparador).
 */
@ValidatorConstraint({ name: 'UnitsCoherentForItemDto', async: false })
export class UnitsCoherentForItemDto implements ValidatorConstraintInterface {
  validate(obj: any) {
    const kind: UnitKind | undefined = obj?.unitKind;
    const base: Unit | undefined = obj?.baseUnit;
    const display: Unit | undefined = obj?.displayUnit;

    // 1) Si hay kind y base, base debe ser la canónica
    if (kind && base && base !== CANONICAL_BASE_BY_KIND[kind]) return false;

    // 2) Si hay kind y display, display debe pertenecer a la familia
    if (kind && display && !unitBelongsToKind(display, kind)) return false;

    // 3) Si NO hay kind, pero hay base/display: deben ser compatibles entre sí
    if (!kind) {
      if (base && display) {
        const possible = (Object.keys(UNITS_BY_KIND) as UnitKind[]).filter(
          (k) =>
            UNITS_BY_KIND[k].includes(base) &&
            UNITS_BY_KIND[k].includes(display),
        );
        if (possible.length === 0) return false;
      }
    }

    return true;
  }

  defaultMessage(_args?: ValidationArguments) {
    return 'Las unidades no son coherentes entre sí o con la familia indicada.';
  }
}
