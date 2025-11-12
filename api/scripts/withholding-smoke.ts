import 'dotenv/config'
import { RuleScope } from '@prisma/client'
import { PrismaService } from '../src/prisma/prisma.service'
import { WithholdingsService } from '../src/withholdings/withholdings.service'

type Scenario = {
  label: string
  scope: RuleScope
  thirdPartyDocument: string
  lines: { base: number; vatAmount?: number; type?: string }[]
}

async function run() {
  const prisma = new PrismaService()
  const withholdings = new WithholdingsService(prisma)

  const scenarios: Scenario[] = [
    {
      label: 'Compra proveedor bebidas (Bogotá, retail)',
      scope: RuleScope.PURCHASES,
      thirdPartyDocument: 'NIT-900100',
      lines: [{ base: 1_000_000, vatAmount: 190_000 }],
    },
    {
      label: 'Compra servicios TI (Medellín, agente)',
      scope: RuleScope.PURCHASES,
      thirdPartyDocument: 'NIT-901800',
      lines: [{ base: 800_000, vatAmount: 152_000 }],
    },
    {
      label: 'Venta cliente no retenedor Bogotá',
      scope: RuleScope.SALES,
      thirdPartyDocument: 'CC-100',
      lines: [{ base: 600_000, vatAmount: 114_000 }],
    },
    {
      label: 'Venta cliente retenedor Bogotá',
      scope: RuleScope.SALES,
      thirdPartyDocument: 'CC-200',
      lines: [{ base: 600_000, vatAmount: 114_000 }],
    },
    {
      label: 'Venta cliente retenedor Medellín',
      scope: RuleScope.SALES,
      thirdPartyDocument: 'NIT-901500',
      lines: [{ base: 600_000, vatAmount: 114_000 }],
    },
  ]

  for (const scenario of scenarios) {
    const thirdParty = await prisma.thirdParty.findUnique({
      where: { document: scenario.thirdPartyDocument },
      select: {
        id: true,
        name: true,
        isWithholdingAgent: true,
        ciiuCode: true,
        municipalityCode: true,
      },
    })

    if (!thirdParty) {
      console.warn(`⚠️  Tercero ${scenario.thirdPartyDocument} no existe, omitiendo`)
      continue
    }

    const calc = await withholdings.calculateForInvoice({
      scope: scenario.scope,
      thirdParty,
      lines: scenario.lines.map((l) => ({
        scope: scenario.scope,
        thirdParty,
        base: l.base,
        vatAmount: l.vatAmount,
      })),
    })

    console.log(`\n=== ${scenario.label} ===`)
    console.log(`Tercero: ${thirdParty.name} (${scenario.thirdPartyDocument})`)
    if (!calc.lines.flat().length) {
      console.log('Sin retenciones aplicables.')
      continue
    }
    for (const line of calc.lines.flat()) {
      console.log(
        `• ${line.type} → base ${line.base.toFixed(2)} x ${line.ratePct ?? 0}% = ${line.amount.toFixed(
          2,
        )} (regla #${line.ruleId ?? 'N/A'})`,
      )
    }
    console.log(`Total retenido: ${calc.total.toFixed(2)}`)
  }

  await prisma.$disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})