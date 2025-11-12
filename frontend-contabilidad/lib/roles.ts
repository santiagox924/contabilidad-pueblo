export const USER_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMINISTRATOR: 'ADMINISTRATOR',
  ACCOUNTING_ADMIN: 'ACCOUNTING_ADMIN',
  ACCOUNTANT: 'ACCOUNTANT',
  ACCOUNTING_ASSISTANT: 'ACCOUNTING_ASSISTANT',
  AUDITOR: 'AUDITOR',
  TREASURY: 'TREASURY',
  PURCHASING: 'PURCHASING',
  SALES: 'SALES',
  INVENTORY: 'INVENTORY',
  COST: 'COST',
  HR: 'HR',
  EXTERNAL_AUDITOR: 'EXTERNAL_AUDITOR',
} as const;

export type UserRoleCode = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const ROLE_LABELS: Record<UserRoleCode, string> = {
  SUPER_ADMIN: 'Super Administrador',
  ADMINISTRATOR: 'Administrador',
  ACCOUNTING_ADMIN: 'Administrador Contable',
  ACCOUNTANT: 'Contador',
  ACCOUNTING_ASSISTANT: 'Auxiliar Contable',
  AUDITOR: 'Auditor Interno',
  TREASURY: 'Tesorería',
  PURCHASING: 'Compras',
  SALES: 'Ventas',
  INVENTORY: 'Inventarios',
  COST: 'Costos',
  HR: 'Recursos Humanos',
  EXTERNAL_AUDITOR: 'Auditor Externo',
};
