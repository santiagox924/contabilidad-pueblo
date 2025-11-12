import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from '../../accounting/accounting.service';
import { PayrollService } from '../payroll.service';

describe('Payroll paymentMethod persistence', () => {
  let prisma: PrismaService;
  let accounting: AccountingService;
  let payroll: PayrollService;

  let createdEntryId: number | null = null;
  let createdThirdPartyId: number | null = null;
  let createdPaymentMethodId: number | null = null;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    accounting = new AccountingService(prisma as any, {} as any);
    payroll = new PayrollService(prisma as any, accounting as any);
  });

  afterAll(async () => {
    try {
      if (createdEntryId) {
        await prisma.journalLine.deleteMany({
          where: { entryId: createdEntryId },
        });
        await prisma.journalEntry.deleteMany({ where: { id: createdEntryId } });
      }
      if (createdPaymentMethodId) {
        await prisma.paymentMethod.deleteMany({
          where: { id: createdPaymentMethodId },
        });
      }
      if (createdThirdPartyId) {
        await prisma.thirdParty.deleteMany({
          where: { id: createdThirdPartyId },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('paymentSimple persists paymentMethodId on JournalEntry', async () => {
    // create a payment method
    const pm = await prisma.paymentMethod.create({
      data: {
        name: 'TEST-PM-' + Date.now(),
        active: true,
        bankAccountCode: '111005',
      },
    });
    createdPaymentMethodId = pm.id;

    // create a dummy employee third party
    const tp = await prisma.thirdParty.create({
      data: { type: 'EMPLOYEE', name: 'TEST EMP', document: 'T-' + Date.now() },
    });
    createdThirdPartyId = tp.id;

    const dto: any = {
      employeeId: tp.id,
      date: new Date(),
      salaryPayable: 100000,
      bankAccountCode: '111005',
      description: 'Test payment with method',
      paymentMethodId: pm.id,
    };

    const res = await payroll.paymentSimple(dto);
    expect(res).toBeDefined();

    const entry = await prisma.journalEntry.findFirst({
      where: { sourceType: 'PAYROLL_PAYMENT', sourceId: tp.id },
    });
    createdEntryId = entry?.id ?? null;
    expect(entry).toBeTruthy();
    expect(entry?.paymentMethodId).toBe(pm.id);
  }, 20000);
});
