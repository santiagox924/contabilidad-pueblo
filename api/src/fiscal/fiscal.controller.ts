import { Controller, Get, Query } from '@nestjs/common';
import { FiscalService } from './fiscal.service';

@Controller('fiscal')
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @Get('calendar')
  listCalendars(
    @Query('year') year?: string,
    @Query('obligation') obligation?: string,
    @Query('regime') regime?: string,
    @Query('municipality') municipality?: string,
    @Query('department') department?: string,
  ) {
    return this.fiscalService.listCalendars({
      year,
      obligation,
      regime,
      municipality,
      department,
    });
  }
}
