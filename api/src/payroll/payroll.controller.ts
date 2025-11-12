import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollSimpleDto } from './payroll.dto';

@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  listRuns(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsedEmployeeId =
      employeeId && !Number.isNaN(Number(employeeId))
        ? Number(employeeId)
        : undefined;
    return this.payrollService.listRuns({
      employeeId: parsedEmployeeId,
      from,
      to,
    });
  }

  @Get('payments')
  listPayments(
    @Query('employeeId') employeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parsedEmployeeId =
      employeeId && !Number.isNaN(Number(employeeId))
        ? Number(employeeId)
        : undefined;
    return this.payrollService.listPayments({
      employeeId: parsedEmployeeId,
      from,
      to,
    });
  }

  @Get(':id')
  getRun(@Param('id', ParseIntPipe) id: number) {
    return this.payrollService.getRun(id);
  }

  @Get(':id/lines')
  getRunLines(@Param('id', ParseIntPipe) id: number) {
    return this.payrollService.getRunLines(id);
  }

  @Post('recognition')
  recognizePayroll(@Body() dto: any) {
    return this.payrollService.recognizePayroll(dto);
  }

  @Post('payment')
  payPayroll(@Body() dto: any) {
    return this.payrollService.payPayroll(dto);
  }

  @Post('contributions')
  payContributions(@Body() dto: any) {
    return this.payrollService.payContributions(dto);
  }

  @Post('advance')
  advanceEmployee(@Body() dto: any) {
    return this.payrollService.advanceEmployee(dto);
  }

  @Post('simple/recognition')
  recognitionSimple(@Body() dto: PayrollSimpleDto) {
    return this.payrollService.recognitionSimple(dto);
  }

  @Post('simple/payment')
  paymentSimple(@Body() dto: PayrollSimpleDto) {
    return this.payrollService.paymentSimple(dto);
  }

  @Post('simple/contributions')
  contributionsSimple(@Body() dto: PayrollSimpleDto) {
    return this.payrollService.contributionsSimple(dto);
  }

  @Post('simple/advance')
  advanceSimple(@Body() dto: PayrollSimpleDto) {
    return this.payrollService.advanceSimple(dto);
  }

  @Post('simple/preview')
  async previewSimple(@Body() dto: PayrollSimpleDto) {
    return await this.payrollService.simplePreview(dto);
  }
}
