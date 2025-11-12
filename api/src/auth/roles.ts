import { UserRoleCode } from '@prisma/client';

export const ALL_USER_ROLES: readonly UserRoleCode[] = [
  'SUPER_ADMIN',
  'ADMINISTRATOR',
  'ACCOUNTING_ADMIN',
  'ACCOUNTANT',
  'ACCOUNTING_ASSISTANT',
  'AUDITOR',
  'TREASURY',
  'PURCHASING',
  'SALES',
  'INVENTORY',
  'COST',
  'HR',
  'EXTERNAL_AUDITOR',
] as const;

export const USER_ROLE_DETAILS: Record<
  UserRoleCode,
  { label: string; description: string }
> = {
  SUPER_ADMIN: {
    label: 'Super Administrador',
    description:
      'Configura la instancia, controla usuarios, empresas y centros de costo.',
  },
  ADMINISTRATOR: {
    label: 'Administrador',
    description:
      'Gestiona catálogos contables, parámetros fiscales y políticas globales.',
  },
  ACCOUNTING_ADMIN: {
    label: 'Administrador Contable',
    description:
      'Autoriza apertura y cierre de periodos, controla mapa de cuentas y asientos.',
  },
  ACCOUNTANT: {
    label: 'Contador',
    description:
      'Registra pólizas, conciliaciones y ajustes; puede cerrar periodos.',
  },
  ACCOUNTING_ASSISTANT: {
    label: 'Auxiliar Contable',
    description:
      'Captura comprobantes, facturas y prepara conciliaciones sin cerrar periodos.',
  },
  AUDITOR: {
    label: 'Auditor Interno',
    description: 'Consulta reportes y bitácoras con permisos de solo lectura.',
  },
  TREASURY: {
    label: 'Tesorería',
    description:
      'Gestiona pagos, cobranzas, conciliaciones bancarias y flujo de caja.',
  },
  PURCHASING: {
    label: 'Compras',
    description: 'Opera órdenes de compra, recepciones y cuentas por pagar.',
  },
  SALES: {
    label: 'Ventas',
    description: 'Gestiona facturación, cuentas por cobrar y notas de crédito.',
  },
  INVENTORY: {
    label: 'Inventarios',
    description:
      'Controla existencias, movimientos y ajustes de inventario físico.',
  },
  COST: {
    label: 'Costos',
    description: 'Supervisa centros de costo, asignaciones y presupuestos.',
  },
  HR: {
    label: 'Recursos Humanos',
    description: 'Administra nómina, prestaciones y provisiones laborales.',
  },
  EXTERNAL_AUDITOR: {
    label: 'Auditor Externo',
    description:
      'Acceso temporal y limitado a reportes normativos y bitácoras.',
  },
};
