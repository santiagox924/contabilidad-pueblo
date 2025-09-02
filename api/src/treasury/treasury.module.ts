import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TreasuryService } from './treasury.service';
import { TreasuryController } from './treasury.controller';

@Module({
  imports: [PrismaModule],
  providers: [TreasuryService],
  controllers: [TreasuryController],
})
export class TreasuryModule {}
