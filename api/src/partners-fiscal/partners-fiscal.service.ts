// api/src/partners-fiscal/partners-fiscal.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { FiscalRegime, Prisma, TaxProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePartnerFiscalDto } from './dto/update-partner-fiscal.dto';

export type PartnerFiscalProfile = {
  id: number;
  name: string;
  document: string | null;
  fiscalRegime: FiscalRegime | null;
  isWithholdingAgent: boolean | null;
  ciiuCode: string | null;
  municipalityCode: string | null;
  // === nuevos (punto 5)
  taxProfile: TaxProfile | null;
  defaultVatId: number | null;
};

@Injectable()
export class PartnersFiscalService {
  constructor(private readonly prisma: PrismaService) {}

  private selectProfile() {
    return {
      id: true,
      name: true,
      document: true,
      fiscalRegime: true,
      isWithholdingAgent: true,
      ciiuCode: true,
      municipalityCode: true,
      // === nuevos (punto 5)
      taxProfile: true,
      defaultVatId: true,
    } satisfies Prisma.ThirdPartySelect;
  }

  async getProfile(thirdPartyId: number): Promise<PartnerFiscalProfile> {
    const tp = await this.prisma.thirdParty.findUnique({
      where: { id: thirdPartyId },
      select: this.selectProfile(),
    });
    if (!tp) throw new NotFoundException(`Tercero ${thirdPartyId} no existe`);
    return tp;
  }

  async updateProfile(
    thirdPartyId: number,
    dto: UpdatePartnerFiscalDto,
  ): Promise<PartnerFiscalProfile> {
    // normalizar strings vacíos a null
    const toNull = (v: any) => (v === '' ? null : v);

    // verificar existencia del tercero
    await this.ensureThirdParty(thirdPartyId);

    // verificación opcional del Tax cuando se envía defaultVatId
    if (dto.defaultVatId !== undefined && dto.defaultVatId !== null) {
      const tax = await this.prisma.tax.findUnique({
        where: { id: dto.defaultVatId },
        select: { id: true },
      });
      if (!tax)
        throw new NotFoundException(`Tax ${dto.defaultVatId} no existe`);
    }

    const updated = await this.prisma.thirdParty.update({
      where: { id: thirdPartyId },
      data: {
        fiscalRegime: dto.fiscalRegime ?? undefined,
        isWithholdingAgent: dto.isWithholdingAgent ?? undefined,
        ciiuCode: dto.ciiuCode === undefined ? undefined : toNull(dto.ciiuCode),
        municipalityCode:
          dto.municipalityCode === undefined
            ? undefined
            : toNull(dto.municipalityCode),

        // === nuevos (punto 5): persistir perfil/forzado de IVA
        taxProfile: dto.taxProfile ?? undefined,
        defaultVatId:
          dto.defaultVatId === null
            ? null
            : dto.defaultVatId !== undefined
              ? dto.defaultVatId
              : undefined,
      },
      select: this.selectProfile(),
    });
    return updated;
  }

  /**
   * Búsqueda con filtros simples (todos opcionales).
   * GET /partners-fiscal?isWithholdingAgent=true&regime=RESPONSABLE_IVA&municipalityCode=11001&ciiuCode=4721
   */
  async findMany(params: {
    isWithholdingAgent?: boolean;
    regime?: FiscalRegime;
    municipalityCode?: string;
    ciiuCode?: string;
    take?: number;
    skip?: number;
  }) {
    const {
      isWithholdingAgent,
      regime,
      municipalityCode,
      ciiuCode,
      take = 50,
      skip = 0,
    } = params || {};
    return this.prisma.thirdParty.findMany({
      where: {
        ...(isWithholdingAgent === undefined ? {} : { isWithholdingAgent }),
        ...(regime ? { fiscalRegime: regime } : {}),
        ...(municipalityCode ? { municipalityCode } : {}),
        ...(ciiuCode ? { ciiuCode } : {}),
      },
      select: this.selectProfile(),
      orderBy: [{ name: 'asc' }],
      take,
      skip,
    });
  }

  private async ensureThirdParty(id: number) {
    const exists = await this.prisma.thirdParty.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException(`Tercero ${id} no existe`);
  }
}
