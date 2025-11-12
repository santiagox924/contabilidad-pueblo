import { Test, TestingModule } from '@nestjs/testing';
import { AccountingService } from '../accounting.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AccountingService - Post Stock Move', () => {
  let service: AccountingService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountingService, PrismaService],
    }).compile();

    service = module.get<AccountingService>(AccountingService);
  });

  it('should post a SALE stock move', async () => {
    // TODO: mock prisma + implement test logic
    expect(service).toBeDefined();
  });

  it('should post an ADJUSTMENT IN stock move', async () => {
    // TODO: mock prisma + implement test logic
    expect(true).toBe(true);
  });

  it('should post an ADJUSTMENT OUT stock move', async () => {
    // TODO: mock prisma + implement test logic
    expect(true).toBe(true);
  });

  it('should post a PRODUCTION stock move', async () => {
    // TODO: mock prisma + implement test logic
    expect(true).toBe(true);
  });
});
