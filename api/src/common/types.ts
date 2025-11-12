// api/src/common/types.ts
import { Unit as PrismaUnit, UnitKind as PrismaUnitKind } from '@prisma/client';

/**
 * Enumeración de unidades de medida soportadas.
 * Se sincroniza con el enum `Unit` de Prisma.
 */
export enum Unit {
  // COUNT
  UN = 'UN', // Unidad / piezas
  DZ = 'DZ', // Docena
  PKG = 'PKG', // Paquete
  BOX = 'BOX', // Caja
  PR = 'PR', // Par
  ROLL = 'ROLL', // Rollo

  // WEIGHT
  MG = 'MG', // Miligramo
  G = 'G', // Gramo
  KG = 'KG', // Kilogramo
  LB = 'LB', // Libra

  // VOLUME
  ML = 'ML', // Mililitro
  L = 'L', // Litro
  M3 = 'M3', // Metro cúbico
  CM3 = 'CM3', // Centímetro cúbico (1cm³ = 1mL)
  OZ_FL = 'OZ_FL', // Onza fluida
  GAL = 'GAL', // Galón

  // LENGTH
  MM = 'MM', // Milímetro
  CM = 'CM', // Centímetro
  M = 'M', // Metro
  KM = 'KM', // Kilómetro
  IN = 'IN', // Pulgada (inch)
  FT = 'FT', // Pie (foot)
  YD = 'YD', // Yarda

  // AREA
  CM2 = 'CM2', // Centímetro cuadrado
  M2 = 'M2', // Metro cuadrado
  IN2 = 'IN2', // Pulgada cuadrada
  FT2 = 'FT2', // Pie cuadrado
  YD2 = 'YD2', // Yarda cuadrada
}

/**
 * Familias de unidades soportadas.
 * Se sincroniza con el enum `UnitKind` de Prisma.
 */
export enum UnitKind {
  COUNT = 'COUNT', // Conteo de piezas
  WEIGHT = 'WEIGHT', // Peso
  VOLUME = 'VOLUME', // Volumen
  LENGTH = 'LENGTH', // Longitud
  AREA = 'AREA', // Área
}

/** Familia de unidades usada en validaciones internas. */
export type UnitFamily = 'COUNT' | 'WEIGHT' | 'VOLUME' | 'LENGTH' | 'AREA';

/** Mapas de conversión rápida entre Prisma y enums locales. */
export const UnitMap = {
  ...PrismaUnit,
};

export const UnitKindMap = {
  ...PrismaUnitKind,
};

/**
 * Tipo genérico para respuestas estándar de servicios.
 * Úsalo cuando quieras retornar estado + datos opcionales.
 */
export interface ServiceResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
}
