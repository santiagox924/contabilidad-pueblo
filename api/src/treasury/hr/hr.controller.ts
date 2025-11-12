import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TreasuryHrService } from './hr.service';
import { QueryEmployeesDto } from './dto/query-employees.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { CreateEmploymentContractDto } from './dto/create-contract.dto';
import { UpdateEmploymentContractDto } from './dto/update-contract.dto';
import { CreateAffiliationDto } from './dto/create-affiliation.dto';
import { UpdateAffiliationDto } from './dto/update-affiliation.dto';

@UseGuards(JwtAuthGuard)
@Controller('treasury/hr')
export class TreasuryHrController {
  constructor(private readonly hr: TreasuryHrService) {}

  @Get('employees')
  listEmployees(@Query() query: QueryEmployeesDto) {
    return this.hr.listEmployees(query);
  }

  @Get('employees/:id')
  getEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryEmployeesDto,
  ) {
    return this.hr.getEmployee(id, query);
  }

  @Post('employees')
  createEmployee(@Body() dto: CreateEmployeeDto) {
    return this.hr.createEmployee(dto);
  }

  @Put('employees/:id')
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.hr.updateEmployee(id, dto);
  }

  @Post('employees/:id/deactivate')
  deactivateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { terminationDate?: string; deactivateThirdParty?: boolean },
  ) {
    return this.hr.deactivateEmployee(id, dto);
  }

  @Delete('employees/:id')
  removeEmployee(@Param('id', ParseIntPipe) id: number) {
    return this.hr.removeEmployee(id);
  }

  @Get('employees/:id/contracts')
  listContracts(@Param('id', ParseIntPipe) id: number) {
    return this.hr.listContracts(id);
  }

  @Post('employees/:id/contracts')
  createContract(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEmploymentContractDto,
  ) {
    return this.hr.createContract(id, dto);
  }

  @Put('contracts/:contractId')
  updateContract(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: UpdateEmploymentContractDto,
  ) {
    return this.hr.updateContract(contractId, dto);
  }

  @Post('contracts/:contractId/close')
  closeContract(
    @Param('contractId', ParseIntPipe) contractId: number,
    @Body() dto: { endDate?: string },
  ) {
    return this.hr.closeContract(contractId, dto?.endDate);
  }

  @Delete('contracts/:contractId')
  removeContract(@Param('contractId', ParseIntPipe) contractId: number) {
    return this.hr.removeContract(contractId);
  }

  @Get('employees/:id/affiliations')
  listAffiliations(@Param('id', ParseIntPipe) id: number) {
    return this.hr.listAffiliations(id);
  }

  @Post('employees/:id/affiliations')
  createAffiliation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateAffiliationDto,
  ) {
    return this.hr.createAffiliation(id, dto);
  }

  @Put('affiliations/:affiliationId')
  updateAffiliation(
    @Param('affiliationId', ParseIntPipe) affiliationId: number,
    @Body() dto: UpdateAffiliationDto,
  ) {
    return this.hr.updateAffiliation(affiliationId, dto);
  }

  @Delete('affiliations/:affiliationId')
  removeAffiliation(
    @Param('affiliationId', ParseIntPipe) affiliationId: number,
  ) {
    return this.hr.removeAffiliation(affiliationId);
  }
}
