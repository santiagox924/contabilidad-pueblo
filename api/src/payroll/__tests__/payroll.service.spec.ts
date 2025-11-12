import { Test, TestingModule } from '@nestjs/testing';
import { PayrollService } from '../payroll.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountingService } from '../../accounting/accounting.service';

// Minimal mocks
const mockPrisma = {
  coaAccount: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  journalEntry: { findFirst: jest.fn(), create: jest.fn() },
  thirdParty: { findMany: jest.fn() },
};
const mockAccounting = {
  createEntryWithTransaction: jest.fn(),
};

describe('PayrollService (simple)', () => {
  let service: PayrollService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AccountingService, useValue: mockAccounting },
      ],
    }).compile();

    service = module.get<PayrollService>(PayrollService);
    // reset mocks
    jest.clearAllMocks();
  });

  it('should build simple lines and preview', async () => {
    const dto = { salary: 2000000, eps: 240000, pension: 320000 };
    mockPrisma.coaAccount.findMany.mockResolvedValue([]);
    mockPrisma.thirdParty.findMany.mockResolvedValue([]);
    const preview = await service.simplePreview(dto as any);
    expect(preview.lines).toBeDefined();
    // expect to include salary debit and eps/pension credits
    const codes = preview.lines.map((l: any) => l.accountCode);
    expect(codes).toContain('510506');
    expect(codes).toContain('237005');
    expect(codes).toContain('237015');
  });

  it('recognitionSimple should call accounting.createEntryWithTransaction', async () => {
    const dto = {
      salary: 2000000,
      eps: 240000,
      pension: 320000,
      employeeId: 1,
    };
    // mock prisma.coaAccount responses for validatePayrollDto
    mockPrisma.coaAccount.findUnique.mockResolvedValue({
      code: '510506',
      isDetailed: true,
      requiresThirdParty: false,
      requiresCostCenter: false,
    });

    // mock prisma.journalEntry.findFirst used in duplicate check
    mockPrisma.journalEntry.findFirst.mockResolvedValue(null);

    await service.recognitionSimple(dto as any);
    expect(mockAccounting.createEntryWithTransaction).toHaveBeenCalled();
  });

  it('should auto-calculate retention when requested', () => {
    const dto = {
      salary: 1000000,
      transport: 0,
      extras: 0,
      autoCalculateRetention: true,
      withholdingRate: 0.1,
    };
    mockPrisma.coaAccount.findMany.mockResolvedValue([]);
    mockPrisma.thirdParty.findMany.mockResolvedValue([]);
    return service.simplePreview(dto as any).then((preview: any) => {
      const retLine = preview.lines.find(
        (l: any) => l.accountCode === '237095',
      );
      expect(retLine).toBeDefined();
      expect(retLine.credit).toBe(100000); // 10% of 1,000,000
    });
  });

  it('should attach accountName and thirdPartyName in preview', async () => {
    const dto = { salary: 500000, eps: 50000, employeeId: 42 };
    // buildSimpleLines will produce account codes 510506 and 237005
    mockPrisma.coaAccount.findMany.mockResolvedValue([
      { code: '510506', name: 'Sueldos', isDetailed: true },
      { code: '237005', name: 'EPS por pagar', isDetailed: true },
    ]);
    mockPrisma.thirdParty.findMany.mockResolvedValue([
      { id: 42, name: 'Juan Perez' },
    ]);
    const preview = await service.simplePreview(dto as any);
    const salaryLine = preview.lines.find(
      (l: any) => l.accountCode === '510506',
    );
    const epsLine = preview.lines.find((l: any) => l.accountCode === '237005');
    expect(salaryLine.accountName).toBe('Sueldos');
    expect(epsLine.thirdPartyName).toBe('Juan Perez');
  });
});
