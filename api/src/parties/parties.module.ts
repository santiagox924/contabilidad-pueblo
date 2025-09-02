import { Module } from '@nestjs/common';
import { PartiesService } from './parties.service';
import { PartiesController } from './parties.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [PartiesController],
  providers: [PartiesService],
})
export class PartiesModule {}
