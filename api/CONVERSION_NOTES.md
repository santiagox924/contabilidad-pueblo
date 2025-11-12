# Notas sobre conversiones UoM y decisión de tratamiento

Fecha: 2025-10-14

Resumen
-------
Durante la verificación de normalización de unidades se detectó una pequeña discrepancia en la familia COUNT (docena ↔ unidad). En concreto, al comprar 1 DZ a 1000 (COP por DZ) y luego vender en UN, el cálculo en libro produjo una diferencia mínima de 0.02 COP (499.98 vs 500) debido a redondeos.

Causa
-----
- El `unitCost` por unidad base se obtiene dividiendo el precio por docena entre 12, lo que da un número periódico (83.3333...).
- Las capas y `unitCost` se almacenan con precisión Decimal(14,6). Sin embargo, los asientos del diario (`journalLine`) se guardan con 2 decimales (Decimal(14,2)), por lo que al multiplicar y redondear aparecen pequeñas diferencias de centavos.

Impacto
-------
- La diferencia observada fue de 0.02 COP para el caso de prueba — practicamente despreciable en la mayoría de escenarios contables.
- No hay pérdida de trazabilidad ni de consistencia funcional: los montos calculados internamente y los montos esperados por la fórmula qtyBase × unitCostBase son coherentes antes del redondeo a 2 decimales.

Decisión (Opción C)
-------------------
Se decidió aceptar y documentar este comportamiento (Opción C). Razones:

1. La diferencia es mínima y causa esperable por redondeo contable.
2. Cambios para forzar suma exactamente igual a 2 decimales requieren reglas de distribución más complejas y afectarían el comportamiento contable en edge cases.
3. Existe un asiento corrector global aplicado para normalizar capas históricas cuando se migraron datos (si fuera necesario replicar para otras tablas, se haría con pasos controlados).

Recomendaciones
---------------
- Documentar la política contable ante fracciones periódicas (p.ej. precio por docena). Actualmente redondeamos a 2 decimales en los asientos.
- Si se requiere exactitud absoluta en centavos para casos de COUNT/DZ, implementar una política de distribución de centavos (p.ej. asignar el redondeo residual a la última línea o a una línea de ajuste por factura).
- Mantener la normalización a unidad base (ya implementada) porque resuelve la mayoría de discrepancias y permite cálculos consistentes.

Archivos / Scripts anexos
------------------------
- `src/__tests__/units.spec.ts` — tests unitarios de conversiones.
- `e2e_family_conversions.js` — E2E purchase→sale por familia (ejecutado).
- `e2e_family_bidirectional.js` — pruebas bidireccionales (ejecutado); muestra el caso con la pequeña desviación para COUNT.
- `apply_uom_normalization_and_adjust.js` — script que normalizó capas históricas y creó asiento corrector.

Si quieres que cambiemos la política y apliquemos una distribución que evite estos centavos residuales, indícalo y preparo la implementación (señalando los criterios de distribución y las cuentas contables a usar para cualquier remanente).
