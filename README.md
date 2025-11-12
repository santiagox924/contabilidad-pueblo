# contabilidad-pueblo
MVP contable con NestJS + Prisma + Postgres

## Limitaciones actuales

- Seguridad y auditoría: permisos por rol muy básicos, sin segregación por centro de costo o empresa; no hay bitácoras normativas (TRD), sellado de tiempo, ni mecanismos para bloquear ajustes fuera de periodo salvo la validación puntual
- Reportería: carece de estados financieros normados (Balance, PyG, Flujo de Efectivo, Anexos NIIF), libros auxiliares exportables en formatos oficiales, catálogo de reportes DIAN/SIIGO, KPIs contables y tableros (diario, mayor, auxiliares, análisis de antigüedad)

## Roles disponibles

- Super Administrador (`SUPER_ADMIN`)
- Administrador (`ADMINISTRATOR`)
- Administrador Contable (`ACCOUNTING_ADMIN`)
- Contador (`ACCOUNTANT`)
- Auxiliar Contable (`ACCOUNTING_ASSISTANT`)
- Auditor Interno (`AUDITOR`)
- Tesorería (`TREASURY`)
- Compras (`PURCHASING`)
- Ventas (`SALES`)
- Inventarios (`INVENTORY`)
- Costos (`COST`)
- Recursos Humanos (`HR`)
- Auditor Externo (`EXTERNAL_AUDITOR`)
