// api/src/common/dto/date-range.dto.ts
import {
  IsDateString,
  IsIn,
  IsOptional,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/** Agrupación para libros/reportes que lo necesiten */
export type RangeGroup = 'invoice' | 'day';

/**
 * Constraint: si existen ambos campos, `from` debe ser <= `to`.
 * OJO: Se aplica sobre una propiedad (dummy) para poder validar a nivel de objeto.
 */
@ValidatorConstraint({ name: 'FromBeforeTo', async: false })
class FromBeforeToConstraint implements ValidatorConstraintInterface {
  validate(_: any, args: ValidationArguments): boolean {
    const obj = args.object as { from?: string; to?: string };
    if (!obj?.from || !obj?.to) return true;
    const from = new Date(obj.from);
    const to = new Date(obj.to);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return true;
    return from.getTime() <= to.getTime();
  }
  defaultMessage(): string {
    return 'from debe ser anterior o igual a to';
  }
}

/** Azúcar sintáctica por si prefieres un decorador explícito */
function IsFromBeforeTo(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'IsFromBeforeTo',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: FromBeforeToConstraint,
    });
  };
}

/** Rango de fechas básico (YYYY-MM-DD o ISO-8601). Ambos son opcionales. */
export class DateRangeDto {
  /** Fecha inicial (incluida) */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fecha final (incluida) */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Propiedad dummy para validar la relación from/to a nivel de objeto */
  @Validate(FromBeforeToConstraint)
  private readonly _fromTo?: true;
}

/** Rango de fechas + agrupación opcional ('invoice' | 'day') */
export class DateRangeGroupDto {
  /** Fecha inicial (incluida) */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Fecha final (incluida) */
  @IsOptional()
  @IsDateString()
  to?: string;

  /** Agrupación (por documento o por día) */
  @IsOptional()
  @IsIn(['invoice', 'day'])
  group?: RangeGroup;

  /** Propiedad dummy para validar la relación from/to a nivel de objeto */
  @Validate(FromBeforeToConstraint)
  @IsFromBeforeTo({ message: 'from debe ser anterior o igual a to' }) // opcional; cualquiera de los dos funciona
  private readonly _fromTo?: true;
}
