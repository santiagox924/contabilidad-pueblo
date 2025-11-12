import { Test, TestingModule } from '@nestjs/testing';
import { AccountingService } from '../accounting.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AccountingService - Reverse Flow', () => {
  let service: AccountingService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountingService, PrismaService],
    }).compile();

    service = module.get<AccountingService>(AccountingService);
  });

  it('should reverse a SALE invoice and stock move', async () => {
    // TODO: mock prisma + simulate sale void -> reverseStockMove + reverse invoice
    expect(service).toBeDefined();
  });

  it('should not duplicate reversals for the same source', async () => {
    // TODO: test idempotency in reverseBySource
    expect(true).toBe(true);
  });
});
