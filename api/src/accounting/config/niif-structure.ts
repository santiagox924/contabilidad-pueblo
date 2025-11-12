// api/src/accounting/config/niif-structure.ts
// Estructuras de estados financieros NIIF. Ajusta los prefijos/códigos según
// el PUC real de la compañía.

export type NiifMatcher = {
  prefixes?: string[];
  codes?: string[];
  excludePrefixes?: string[];
};

export type NiifNodeConfig = {
  id: string;
  label: string;
  matchers?: NiifMatcher[];
  multiplier?: number; // Útil para restar partidas (p. ej. costos, gastos)
  children?: NiifNodeConfig[];
  notes?: string;
};

// Helpers para declarar matchers de manera sucinta
const pref = (...prefixes: string[]): NiifMatcher => ({ prefixes });
const codes = (...values: string[]): NiifMatcher => ({ codes: values });

export const NIIF_BALANCE_STRUCTURE: NiifNodeConfig[] = [
  {
    id: 'assets',
    label: 'Activo total',
    children: [
      {
        id: 'current_assets',
        label: 'Activo corriente',
        children: [
          {
            id: 'cash_and_equivalents',
            label: 'Efectivo y equivalentes de efectivo',
            matchers: [pref('11')],
          },
          {
            id: 'short_term_investments',
            label: 'Inversiones a corto plazo',
            matchers: [pref('12')],
          },
          {
            id: 'trade_receivables',
            label: 'Cuentas por cobrar comerciales y otras cuentas por cobrar',
            matchers: [pref('13')],
          },
          {
            id: 'inventories',
            label: 'Inventarios',
            matchers: [pref('14')],
          },
          {
            id: 'other_current_assets',
            label: 'Otros activos corrientes',
            matchers: [pref('19')],
          },
        ],
      },
      {
        id: 'non_current_assets',
        label: 'Activo no corriente',
        children: [
          {
            id: 'property_plant_equipment',
            label: 'Propiedad, planta y equipo',
            matchers: [pref('15')],
          },
          {
            id: 'intangible_assets',
            label: 'Activos intangibles',
            matchers: [pref('16')],
          },
          {
            id: 'deferred_tax_assets',
            label: 'Activos por impuestos diferidos',
            matchers: [pref('17')],
          },
          {
            id: 'other_non_current_assets',
            label: 'Otros activos no corrientes',
            matchers: [pref('18')],
          },
        ],
      },
    ],
  },
  {
    id: 'liabilities',
    label: 'Pasivo total',
    children: [
      {
        id: 'current_liabilities',
        label: 'Pasivo corriente',
        children: [
          {
            id: 'financial_liabilities_cp',
            label: 'Obligaciones financieras corrientes',
            matchers: [pref('21')],
          },
          {
            id: 'trade_payables',
            label: 'Cuentas por pagar comerciales y otras cuentas por pagar',
            matchers: [pref('22')],
          },
          {
            id: 'tax_liabilities',
            label: 'Pasivos por impuestos corrientes',
            matchers: [pref('24')],
          },
          {
            id: 'other_current_liabilities',
            label: 'Otros pasivos corrientes',
            matchers: [pref('23', '28')],
          },
        ],
      },
      {
        id: 'non_current_liabilities',
        label: 'Pasivo no corriente',
        children: [
          {
            id: 'financial_liabilities_lp',
            label: 'Obligaciones financieras no corrientes',
            matchers: [pref('25')],
          },
          {
            id: 'provisions',
            label: 'Provisiones a largo plazo',
            matchers: [pref('26')],
          },
          {
            id: 'deferred_tax_liabilities',
            label: 'Pasivos por impuestos diferidos',
            matchers: [pref('27')],
          },
          {
            id: 'other_non_current_liabilities',
            label: 'Otros pasivos no corrientes',
            matchers: [pref('29')],
          },
        ],
      },
    ],
  },
  {
    id: 'equity',
    label: 'Patrimonio',
    children: [
      {
        id: 'share_capital',
        label: 'Capital emitido',
        matchers: [pref('31')],
      },
      {
        id: 'additional_paid_in_capital',
        label: 'Prima en colocación de acciones',
        matchers: [pref('32')],
      },
      {
        id: 'reserves',
        label: 'Reservas',
        matchers: [pref('33', '34', '35')],
      },
      {
        id: 'retained_earnings',
        label: 'Utilidades retenidas y resultados acumulados',
        matchers: [pref('36', '37')],
      },
      {
        id: 'other_equity_accounts',
        label: 'Otros componentes del patrimonio',
        matchers: [pref('38', '39')],
      },
    ],
  },
];

export const NIIF_INCOME_STRUCTURE: NiifNodeConfig[] = [
  {
    id: 'comprehensive_income',
    label: 'Resultado integral del periodo',
    children: [
      {
        id: 'operating_result',
        label: 'Resultado de actividades de operación',
        children: [
          {
            id: 'gross_profit',
            label: 'Utilidad bruta',
            children: [
              {
                id: 'ordinary_revenue',
                label: 'Ingresos de actividades ordinarias',
                matchers: [pref('41', '42', '43')],
              },
              {
                id: 'cost_of_sales',
                label: 'Costos de ventas',
                multiplier: -1,
                matchers: [pref('61')],
              },
            ],
          },
          {
            id: 'operating_expenses',
            label: 'Gastos de administración y de venta',
            multiplier: -1,
            matchers: [pref('51', '52', '53', '55', '57', '58')],
          },
          {
            id: 'other_operating_income',
            label: 'Otros ingresos operacionales',
            matchers: [pref('48')],
          },
          {
            id: 'other_operating_expenses',
            label: 'Otros gastos operacionales',
            multiplier: -1,
            matchers: [pref('59')],
          },
        ],
      },
      {
        id: 'finance_result',
        label: 'Resultado financiero',
        children: [
          {
            id: 'finance_income',
            label: 'Ingresos financieros',
            matchers: [pref('47')],
          },
          {
            id: 'finance_expenses',
            label: 'Gastos financieros',
            multiplier: -1,
            matchers: [pref('56')],
          },
        ],
      },
      {
        id: 'taxes',
        label: 'Impuesto a las ganancias',
        multiplier: -1,
        matchers: [pref('54')],
      },
    ],
  },
];

export const NIIF_CASH_FLOW_STRUCTURE: NiifNodeConfig[] = [
  {
    id: 'cash_flow_operating',
    label: 'Flujos de efectivo de actividades de operación',
    matchers: [
      pref('41', '51', '52', '53', '54', '55', '56', '57', '58', '59', '61'),
    ],
  },
  {
    id: 'cash_flow_investing',
    label: 'Flujos de efectivo de actividades de inversión',
    matchers: [pref('15', '16', '17', '18')],
  },
  {
    id: 'cash_flow_financing',
    label: 'Flujos de efectivo de actividades de financiación',
    matchers: [pref('21', '22', '23', '24', '25', '26')],
  },
];

export const NIIF_DEFAULT_CURRENCY = 'COP';
