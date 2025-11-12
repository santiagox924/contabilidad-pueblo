import { Test, TestingModule } from '@nestjs/testing';
import { AccountsService } from '../accounts.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AccountsService', () => {
  let service: AccountsService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountsService, PrismaService],
    }).compile();

    service = module.get<AccountsService>(AccountsService);
  });

  it('should mark bank accounts as reconcilable', async () => {
    // TODO: mock prisma + verify isReconciliable flag
    expect(service).toBeDefined();
  });

  it('should flip isDetailed flag when account has lines', async () => {
    // TODO: simulate account with journal lines -> isDetailed = true
    expect(true).toBe(true);
  });
});
