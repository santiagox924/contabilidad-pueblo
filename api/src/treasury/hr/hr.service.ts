import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountClass,
  EmploymentStatus,
  EmployeeAffiliationType,
  FlowType,
  PayrollRunStatus,
  PartyType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeesDto } from './dto/query-employees.dto';
import { CreateEmploymentContractDto } from './dto/create-contract.dto';
import { UpdateEmploymentContractDto } from './dto/update-contract.dto';
import { CreateAffiliationDto } from './dto/create-affiliation.dto';
import { UpdateAffiliationDto } from './dto/update-affiliation.dto';

@Injectable()
export class TreasuryHrService {
  constructor(private readonly prisma: PrismaService) {}

  private toDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Fecha inválida: ${value}`);
    }
    return date;
  }

  private async ensureAccountExists(
    code?: string | null,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    if (!code) return null;
    const trimmed = code.trim();
    if (!trimmed) return null;
    const account = await client.coaAccount.findUnique({
      where: { code: trimmed },
      select: { code: true, isDetailed: true, class: true, flowType: true },
    });
    if (!account) {
      throw new BadRequestException(
        `La cuenta contable ${trimmed} no existe en el plan de cuentas`,
      );
    }
    if (account.isDetailed === false) {
      throw new BadRequestException(
        `La cuenta ${trimmed} no permite movimientos directos. Usa una subcuenta detallada`,
      );
    }
    if (account.class !== AccountClass.LIABILITY) {
      throw new BadRequestException(
        `La cuenta ${trimmed} no pertenece a pasivos. Selecciona una cuenta del grupo 23 o 25.`,
      );
    }
    if (account.flowType && account.flowType !== FlowType.AP && account.flowType !== FlowType.NONE) {
      throw new BadRequestException(
        `La cuenta ${trimmed} no está parametrizada como cuenta por pagar (flowType: ${account.flowType}).`,
      );
    }
    const prefix = trimmed.slice(0, 2);
    if (!['23', '25'].includes(prefix)) {
      throw new BadRequestException(
        `La cuenta ${trimmed} no corresponde a un pasivo laboral (23xx o 25xx).`,
      );
    }
    return trimmed;
  }

  private async ensureThirdParty(
    thirdPartyId: number,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const thirdParty = await client.thirdParty.findUnique({
      where: { id: thirdPartyId },
      select: {
        id: true,
        active: true,
        type: true,
        roles: true,
        payableAccountCode: true,
        employeePayableAccountCode: true,
      },
    });
    if (!thirdParty || !thirdParty.active) {
      throw new NotFoundException('Tercero no encontrado o inactivo');
    }
    let roles = Array.isArray(thirdParty.roles) ? thirdParty.roles : [];
    if (!roles.includes(PartyType.EMPLOYEE)) {
      const updatedRoles = Array.from(new Set([...roles, PartyType.EMPLOYEE]));
      await client.thirdParty.update({
        where: { id: thirdPartyId },
        data: { roles: { set: updatedRoles as PartyType[] } },
      });
      roles = updatedRoles;
    }
    return { ...thirdParty, roles };
  }

  private employeeInclude(query?: QueryEmployeesDto) {
    return {
      thirdParty: {
        select: {
          id: true,
          name: true,
          document: true,
          email: true,
          phone: true,
          address: true,
          city: true,
        },
      },
      contracts: query?.includeContracts
        ? {
            orderBy: { startDate: 'desc' },
            take: 5,
          }
        : undefined,
      affiliations: query?.includeAffiliations
        ? {
            orderBy: { startDate: 'asc' },
            include: {
              thirdParty: {
                select: { id: true, name: true, document: true },
              },
            },
          }
        : undefined,
    } satisfies Prisma.EmployeeProfileInclude;
  }

  async listEmployees(query: QueryEmployeesDto) {
    const filters: Prisma.EmployeeProfileWhereInput[] = [];
    if (!query.status && !query.includeTerminated) {
      filters.push({ status: { not: EmploymentStatus.TERMINATED } });
    }
    if (query.status) {
      filters.push({ status: query.status });
    }
    if (query.search) {
      const term = query.search.trim();
      if (term.length) {
        filters.push({
          OR: [
            {
              thirdParty: {
                name: { contains: term, mode: 'insensitive' },
              },
            },
            {
              thirdParty: {
                document: { contains: term, mode: 'insensitive' },
              },
            },
            { jobTitle: { contains: term, mode: 'insensitive' } },
            { department: { contains: term, mode: 'insensitive' } },
          ],
        });
      }
    }

    const where =
      filters.length === 0
        ? undefined
        : { AND: filters } as Prisma.EmployeeProfileWhereInput;

    return this.prisma.employeeProfile.findMany({
      where,
      include: this.employeeInclude(query),
      orderBy: { thirdParty: { name: 'asc' } },
    });
  }

  async getEmployee(id: number, query?: QueryEmployeesDto) {
    const profile = await this.resolveProfile(id, query);
    return profile;
  }

  async createEmployee(dto: CreateEmployeeDto) {
    return this.prisma.$transaction(async (tx) => {
      const thirdParty = await this.ensureThirdParty(dto.thirdPartyId, tx);
      const payableAccountCode = await this.ensureAccountExists(
        dto.payableAccountCode,
        tx,
      );

      const data: Prisma.EmployeeProfileCreateInput = {
        thirdParty: { connect: { id: dto.thirdPartyId } },
        status: dto.status ?? EmploymentStatus.ACTIVE,
        jobTitle: dto.jobTitle?.trim() || undefined,
        department: dto.department?.trim() || undefined,
        notes: dto.notes?.trim() || undefined,
        payableAccountCode,
      };

      const hireDate = this.toDate(dto.hireDate);
      if (hireDate) data.hireDate = hireDate;
      const terminationDate = this.toDate(dto.terminationDate);
      if (terminationDate) data.terminationDate = terminationDate;
      if (dto.defaultCostCenterId) {
        data.defaultCostCenter = {
          connect: { id: dto.defaultCostCenterId },
        };
      }

      const created = await tx.employeeProfile.create({
        data,
        include: this.employeeInclude({
          includeContracts: true,
          includeAffiliations: true,
        }),
      });

      if (payableAccountCode !== null) {
        const thirdPartyUpdate: Prisma.ThirdPartyUpdateInput = {
          employeePayableAccountCode: payableAccountCode,
        };
        if (!thirdParty.payableAccountCode) {
          thirdPartyUpdate.payableAccountCode = payableAccountCode;
        }
        await tx.thirdParty.update({
          where: { id: thirdParty.id },
          data: thirdPartyUpdate,
        });
      }

      return created;
    });
  }

  async updateEmployee(id: number, dto: UpdateEmployeeDto) {
    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employeeProfile.findUnique({
        where: { id },
        select: { thirdPartyId: true },
      });
      if (!employee) throw new NotFoundException('Empleado no encontrado');
      const thirdParty = await this.ensureThirdParty(employee.thirdPartyId, tx);

      let payableAccountCode: string | null | undefined = undefined;
      if (dto.payableAccountCode !== undefined) {
        payableAccountCode = await this.ensureAccountExists(
          dto.payableAccountCode,
          tx,
        );
      }

      const data: Prisma.EmployeeProfileUpdateInput = {};
      if (dto.status) data.status = dto.status;
      if (dto.jobTitle !== undefined)
        data.jobTitle = dto.jobTitle?.trim() || null;
      if (dto.department !== undefined)
        data.department = dto.department?.trim() || null;
      if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
      if (dto.hireDate !== undefined) data.hireDate = this.toDate(dto.hireDate);
      if (dto.terminationDate !== undefined)
        data.terminationDate = this.toDate(dto.terminationDate);
      if (dto.defaultCostCenterId !== undefined) {
        data.defaultCostCenter =
          dto.defaultCostCenterId == null
            ? { disconnect: true }
            : { connect: { id: dto.defaultCostCenterId } };
      }
      if (dto.payableAccountCode !== undefined) {
        data.payableAccountCode = payableAccountCode ?? null;
      }

      const updated = await tx.employeeProfile.update({
        where: { id },
        data,
        include: this.employeeInclude({
          includeContracts: true,
          includeAffiliations: true,
        }),
      });

      if (dto.payableAccountCode !== undefined) {
        const thirdPartyUpdate: Prisma.ThirdPartyUpdateInput = {
          employeePayableAccountCode: payableAccountCode ?? null,
        };
        if (
          payableAccountCode &&
          (!thirdParty.payableAccountCode ||
            thirdParty.payableAccountCode.trim().length === 0)
        ) {
          thirdPartyUpdate.payableAccountCode = payableAccountCode;
        }
        await tx.thirdParty.update({
          where: { id: employee.thirdPartyId },
          data: thirdPartyUpdate,
        });
      }

      return updated;
    });
  }

  async listContracts(employeeId: number) {
    const profile = await this.resolveProfile(employeeId);
    return this.prisma.employmentContract.findMany({
      where: { employeeId: profile.id },
      orderBy: [{ isActive: 'desc' }, { startDate: 'desc' }],
    });
  }

  async createContract(
    employeeId: number,
    dto: CreateEmploymentContractDto,
  ) {
    const profile = await this.resolveProfile(employeeId);

    if (dto.endDate && new Date(dto.endDate) < new Date(dto.startDate)) {
      throw new BadRequestException(
        'La fecha de finalización no puede ser anterior al inicio',
      );
    }

    const contract = await this.prisma.employmentContract.create({
      data: {
        employeeId: profile.id,
        contractType: dto.contractType,
        code: dto.code?.trim() || null,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        salaryAmount: new Prisma.Decimal(dto.salaryAmount),
        salaryFrequency: dto.salaryFrequency,
        workingHours: dto.workingHours?.trim() || null,
        probationEnd: dto.probationEnd ? new Date(dto.probationEnd) : null,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });

    return contract;
  }

  async updateContract(
    contractId: number,
    dto: UpdateEmploymentContractDto,
  ) {
    const existing = await this.prisma.employmentContract.findUnique({
      where: { id: contractId },
    });
    if (!existing) throw new NotFoundException('Contrato no encontrado');

    const data: Prisma.EmploymentContractUpdateInput = {};
    let proposedStart = existing.startDate;
    if (dto.startDate) {
      const start = new Date(dto.startDate);
      if (Number.isNaN(start.getTime())) {
        throw new BadRequestException('Fecha de inicio inválida');
      }
      proposedStart = start;
      data.startDate = start;
    }
    if (dto.endDate !== undefined) {
      const end = dto.endDate ? new Date(dto.endDate) : null;
      if (end && proposedStart && end < proposedStart) {
        throw new BadRequestException(
          'La fecha de finalización no puede ser anterior al inicio',
        );
      }
      data.endDate = end;
    }
    if (dto.contractType) data.contractType = dto.contractType;
    if (dto.code !== undefined) data.code = dto.code?.trim() || null;
    if (dto.startDate) data.startDate = proposedStart!;
    if (dto.salaryAmount !== undefined)
      data.salaryAmount = new Prisma.Decimal(dto.salaryAmount);
    if (dto.salaryFrequency) data.salaryFrequency = dto.salaryFrequency;
    if (dto.workingHours !== undefined)
      data.workingHours = dto.workingHours?.trim() || null;
    if (dto.probationEnd !== undefined)
      data.probationEnd = dto.probationEnd
        ? new Date(dto.probationEnd)
        : null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.employmentContract.update({
      where: { id: contractId },
      data,
    });

    return updated;
  }

  async closeContract(contractId: number, endDate?: string) {
    const existing = await this.prisma.employmentContract.findUnique({
      where: { id: contractId },
    });
    if (!existing) throw new NotFoundException('Contrato no encontrado');
    const closeDate = endDate ? new Date(endDate) : new Date();
    if (closeDate < existing.startDate) {
      throw new BadRequestException(
        'La fecha de finalización no puede ser anterior al inicio',
      );
    }
    return this.prisma.employmentContract.update({
      where: { id: contractId },
      data: {
        endDate: closeDate,
        isActive: false,
      },
    });
  }

  async removeContract(contractId: number) {
    const contract = await this.prisma.employmentContract.findUnique({
      where: { id: contractId },
    });
    if (!contract) throw new NotFoundException('Contrato no encontrado');
    await this.prisma.employmentContract.delete({ where: { id: contractId } });
    return { ok: true };
  }

  async listAffiliations(employeeId: number) {
    const profile = await this.resolveProfile(employeeId);
    return this.prisma.employeeAffiliation.findMany({
      where: { employeeId: profile.id },
      include: {
        thirdParty: { select: { id: true, name: true, document: true } },
      },
      orderBy: [{ startDate: 'asc' }],
    });
  }

  async createAffiliation(
    employeeId: number,
    dto: CreateAffiliationDto,
  ) {
    const profile = await this.resolveProfile(employeeId);
    await this.ensureAffiliationProvider(dto.thirdPartyId, dto.kind);
    const data: Prisma.EmployeeAffiliationCreateInput = {
      employee: { connect: { id: profile.id } },
      kind: dto.kind,
      thirdParty: { connect: { id: dto.thirdPartyId } },
      startDate: dto.startDate ? new Date(dto.startDate) : null,
      endDate: dto.endDate ? new Date(dto.endDate) : null,
      notes: dto.notes?.trim() || null,
    };
    return this.prisma.employeeAffiliation.create({ data });
  }

  async updateAffiliation(
    affiliationId: number,
    dto: UpdateAffiliationDto,
  ) {
    const existing = await this.prisma.employeeAffiliation.findUnique({
      where: { id: affiliationId },
    });
    if (!existing) {
      throw new NotFoundException('Afiliación no encontrada');
    }
    if (dto.thirdPartyId) {
      await this.ensureAffiliationProvider(dto.thirdPartyId, dto.kind ?? existing.kind);
    }
    const data: Prisma.EmployeeAffiliationUpdateInput = {};
    if (dto.kind) data.kind = dto.kind;
    if (dto.thirdPartyId)
      data.thirdParty = { connect: { id: dto.thirdPartyId } };
    if (dto.startDate !== undefined) {
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    }
    if (dto.endDate !== undefined) {
      const end = dto.endDate ? new Date(dto.endDate) : null;
      if (end && existing.startDate && end < existing.startDate) {
        throw new BadRequestException(
          'La fecha de finalización no puede ser anterior al inicio',
        );
      }
      data.endDate = end;
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    return this.prisma.employeeAffiliation.update({
      where: { id: affiliationId },
      data,
    });
  }

  async removeAffiliation(affiliationId: number) {
    const existing = await this.prisma.employeeAffiliation.findUnique({
      where: { id: affiliationId },
    });
    if (!existing) throw new NotFoundException('Afiliación no encontrada');
    await this.prisma.employeeAffiliation.delete({ where: { id: affiliationId } });
    return { ok: true };
  }

  async deactivateEmployee(
    id: number,
    options?: { terminationDate?: string; deactivateThirdParty?: boolean },
  ) {
    const termination = options?.terminationDate
      ? new Date(options.terminationDate)
      : new Date();
    if (Number.isNaN(termination.getTime())) {
      throw new BadRequestException('Fecha de retiro invalida');
    }

    return this.prisma.$transaction(async (tx) => {
      const profile = await this.resolveProfile(id, undefined, tx);
      if (profile.hireDate && termination < profile.hireDate) {
        throw new BadRequestException(
          'La fecha de retiro no puede ser anterior a la de ingreso',
        );
      }

      const updated = await tx.employeeProfile.update({
        where: { id: profile.id },
        data: {
          status: EmploymentStatus.INACTIVE,
          terminationDate: termination,
        },
      });

      await tx.employmentContract.updateMany({
        where: { employeeId: profile.id, isActive: true },
        data: { isActive: false, endDate: termination },
      });

      if (options?.deactivateThirdParty) {
        await tx.thirdParty.update({
          where: { id: profile.thirdPartyId },
          data: { active: false },
        });
      }

      return updated;
    });
  }

  async removeEmployee(id: number) {
    const termination = new Date();
    if (Number.isNaN(termination.getTime())) {
      throw new BadRequestException('No se pudo calcular la fecha de retiro');
    }

    return this.prisma.$transaction(async (tx) => {
      const profile = await this.resolveProfile(id, undefined, tx);
      const hasPostedPayroll = await tx.payrollRun.count({
        where: {
          employeeId: profile.id,
          status: { in: [PayrollRunStatus.POSTED, PayrollRunStatus.CALCULATED] },
        },
      });

      if (profile.hireDate && termination < profile.hireDate) {
        throw new BadRequestException(
          'No es posible eliminar antes de la fecha de ingreso',
        );
      }

      await tx.employmentContract.updateMany({
        where: { employeeId: profile.id, isActive: true },
        data: { isActive: false, endDate: termination },
      });

      await tx.employeeAffiliation.updateMany({
        where: { employeeId: profile.id, endDate: null },
        data: { endDate: termination },
      });

      const metadataBase =
        profile.metadata && typeof profile.metadata === 'object'
          ? (profile.metadata as Prisma.JsonObject)
          : {};
      const metadata: Prisma.JsonObject = {
        ...metadataBase,
        archivedAt: termination.toISOString(),
      };

      await tx.employeeProfile.update({
        where: { id: profile.id },
        data: {
          status: EmploymentStatus.TERMINATED,
          terminationDate: termination,
          metadata,
        },
      });

      return {
        ok: true,
        archived: true,
        status: EmploymentStatus.TERMINATED,
        hasPostedPayroll: hasPostedPayroll > 0,
        message:
          hasPostedPayroll > 0
            ? 'El empleado tiene historial de nomina. Se marco como terminado.'
            : 'Empleado marcado como terminado y archivado.',
      };
    });
  }

  private async resolveProfile(
    id: number,
    query?: QueryEmployeesDto,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    let employee = await client.employeeProfile.findUnique({
      where: { id },
      include: query ? this.employeeInclude(query) : undefined,
    });
    if (!employee) {
      employee = await client.employeeProfile.findFirst({
        where: { thirdPartyId: id },
        include: query ? this.employeeInclude(query) : undefined,
      });
    }
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    return employee;
  }

  private async ensureAffiliationProvider(
    thirdPartyId: number,
    kind: EmployeeAffiliationType,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const provider = await client.thirdParty.findUnique({
      where: { id: thirdPartyId },
    });
    if (!provider) {
      throw new BadRequestException(
        `La entidad de afiliación (${thirdPartyId}) no existe`,
      );
    }
    if (!provider.roles.includes(PartyType.PROVIDER)) {
      await client.thirdParty.update({
        where: { id: thirdPartyId },
        data: {
          roles: {
            set: Array.from(new Set([...provider.roles, PartyType.PROVIDER])),
          },
        },
      });
    }
    // optional: we could validate default accounts by kind
  }
}
