export type PayrollLineInput = {
  accountCode: string
  debit?: number
  credit?: number
  thirdPartyId?: number
  costCenterId?: number
  description?: string
}

const addLine = (
  lines: PayrollLineInput[],
  accountCode: string,
  amount: number | null | undefined,
  kind: 'debit' | 'credit',
  extra?: Partial<PayrollLineInput>,
) => {
  if (!amount || Number.isNaN(amount) || Math.abs(amount) < 0.000001) {
    return
  }
  const value = Math.round(Number(amount) * 100) / 100
  if (!value) return
  const payload: PayrollLineInput = {
    accountCode,
    ...(kind === 'debit' ? { debit: value } : { credit: value }),
    ...extra,
  }
  lines.push(payload)
}

export type RecognitionFormState = {
  employeeId?: number | null
  salaryIntegral?: number
  salary?: number
  jornales?: number
  overtime?: number
  commissions?: number
  viaticos?: number
  incapacities?: number
  transportAllowance?: number
  auxilios?: number
  bonificaciones?: number
  retention?: number
  eps?: number
  pension?: number
  arl?: number
  ccf?: number
  embargoes?: number
  libranzas?: number
  otrosDescuentos?: number
  employerEps?: number
  employerPension?: number
  employerArl?: number
  employerCcf?: number
  provisionsCesantias?: number
  provisionsInterestCesantias?: number
  provisionsPrima?: number
  provisionsVacations?: number
  salaryPayable?: number
  autoCalculateRetention?: boolean
  withholdingRate?: number
}

export function buildRecognitionLines(form: RecognitionFormState): PayrollLineInput[] {
  const lines: PayrollLineInput[] = []
  const thirdPartyExtra = form.employeeId ? { thirdPartyId: form.employeeId } : undefined

  const earnings: Array<[string, number | undefined | null]> = [
    ['510503', form.salaryIntegral],
    ['510506', form.salary],
    ['510512', form.jornales],
    ['510515', form.overtime],
    ['510518', form.commissions],
    ['510521', form.viaticos],
    ['510524', form.incapacities],
    ['510527', form.transportAllowance],
    ['510545', form.auxilios],
    ['510548', form.bonificaciones],
  ]

  earnings.forEach(([code, amount]) => addLine(lines, code, amount, 'debit'))

  let retentionValue = form.retention ?? 0
  if (form.autoCalculateRetention) {
    const base = earnings.reduce((sum, [, amt]) => sum + (Number(amt) || 0), 0)
    const rate =
      form.withholdingRate !== undefined && form.withholdingRate !== null
        ? Number(form.withholdingRate)
        : 0.01
    retentionValue = Math.round(base * rate * 100) / 100
  }

  addLine(lines, '237095', retentionValue, 'credit', thirdPartyExtra)
  addLine(lines, '237005', form.eps, 'credit', thirdPartyExtra)
  addLine(lines, '237015', form.pension, 'credit', thirdPartyExtra)
  addLine(lines, '237006', form.arl, 'credit', thirdPartyExtra)
  addLine(lines, '237010', form.ccf, 'credit', thirdPartyExtra)
  addLine(lines, '237025', form.embargoes, 'credit', thirdPartyExtra)
  addLine(lines, '237030', form.libranzas, 'credit', thirdPartyExtra)
  addLine(lines, '237095', form.otrosDescuentos, 'credit', thirdPartyExtra)

  addLine(lines, '510569', form.employerEps, 'debit')
  addLine(lines, '237005', form.employerEps, 'credit')
  addLine(lines, '510557', form.employerPension, 'debit')
  addLine(lines, '237015', form.employerPension, 'credit')
  addLine(lines, '510568', form.employerArl, 'debit')
  addLine(lines, '237006', form.employerArl, 'credit')
  addLine(lines, '510572', form.employerCcf, 'debit')
  addLine(lines, '237010', form.employerCcf, 'credit')

  addLine(lines, '510530', form.provisionsCesantias, 'debit')
  addLine(lines, '261005', form.provisionsCesantias, 'credit')
  addLine(lines, '510533', form.provisionsInterestCesantias, 'debit')
  addLine(lines, '261010', form.provisionsInterestCesantias, 'credit')
  addLine(lines, '510536', form.provisionsPrima, 'debit')
  addLine(lines, '251598', form.provisionsPrima, 'credit')
  addLine(lines, '510539', form.provisionsVacations, 'debit')
  addLine(lines, '261015', form.provisionsVacations, 'credit')

  if (form.salaryPayable && form.salaryPayable > 0) {
    addLine(lines, '250505', form.salaryPayable, 'credit', thirdPartyExtra)
  } else {
    const totalDebit = lines.reduce((sum, line) => sum + (line.debit ?? 0), 0)
    const totalCredit = lines
      .filter((line) => line.accountCode !== '250505')
      .reduce((sum, line) => sum + (line.credit ?? 0), 0)
    const net = Math.round((totalDebit - totalCredit) * 100) / 100
    if (net !== 0) addLine(lines, '250505', net, 'credit', thirdPartyExtra)
  }

  return lines
}

export function buildPaymentLines(params: {
  employeeId?: number | null
  amount: number
  bankAccountCode: string
}): PayrollLineInput[] {
  const lines: PayrollLineInput[] = []
  addLine(lines, '250505', params.amount, 'debit', {
    thirdPartyId: params.employeeId ?? undefined,
  })
  addLine(lines, params.bankAccountCode, params.amount, 'credit')
  return lines
}

export function buildContributionLines(params: {
  employeeId?: number | null
  eps?: number
  pension?: number
  arl?: number
  ccf?: number
  bankAccountCode: string
}): PayrollLineInput[] {
  const lines: PayrollLineInput[] = []
  const total =
    Number(params.eps || 0) +
    Number(params.pension || 0) +
    Number(params.arl || 0) +
    Number(params.ccf || 0)
  addLine(lines, '237005', params.eps, 'debit', {
    thirdPartyId: params.employeeId ?? undefined,
  })
  addLine(lines, '237015', params.pension, 'debit', {
    thirdPartyId: params.employeeId ?? undefined,
  })
  addLine(lines, '237006', params.arl, 'debit', {
    thirdPartyId: params.employeeId ?? undefined,
  })
  addLine(lines, '237010', params.ccf, 'debit', {
    thirdPartyId: params.employeeId ?? undefined,
  })
  addLine(lines, params.bankAccountCode, total, 'credit')
  return lines.filter(
    (line) => (line.debit ?? 0) !== 0 || (line.credit ?? 0) !== 0,
  )
}

export function buildAdvanceLines(params: {
  amount: number
  bankAccountCode: string
}): PayrollLineInput[] {
  const lines: PayrollLineInput[] = []
  addLine(lines, '133005', params.amount, 'debit')
  addLine(lines, params.bankAccountCode, params.amount, 'credit')
  return lines
}
