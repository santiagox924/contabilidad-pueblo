// api/src/common/geo/geo.service.ts
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { SearchMunicipalitiesDto } from './dto/search-municipalities.dto';

@Injectable()
export class GeoService {
  constructor(private readonly prisma: PrismaService) {}

  async searchMunicipalities(dto: SearchMunicipalitiesDto) {
    const take = Math.min(Math.max(dto.take ?? 20, 1), 100);

    const where: Record<string, any> = {};

    if (dto.departmentCode) {
      where.departmentCode = dto.departmentCode.trim();
    }

    if (dto.code) {
      where.code = dto.code.trim();
    }

    if (dto.query) {
      const query = dto.query.trim();
      if (query.length) {
        const normalized = query.replace(/\s+/g, ' ');
        const digits = normalized.replace(/[^0-9]/g, '');
        const or: any[] = [
          { name: { contains: normalized, mode: 'insensitive' } },
          { departmentName: { contains: normalized, mode: 'insensitive' } },
        ];
        if (digits.length) {
          or.push({ code: { startsWith: digits } });
          if (digits.length <= 2) {
            or.push({
              departmentCode: { startsWith: digits.padStart(2, '0') },
            });
          }
        }
        where.OR = or;
      }
    }

    const rows = await (this.prisma as any).municipality.findMany({
      where,
      take,
      orderBy: [{ departmentCode: 'asc' }, { name: 'asc' }],
    });

    return rows.map((row: any) => ({
      code: row.code,
      name: row.name,
      departmentCode: row.departmentCode,
      departmentName: row.departmentName,
      type: row.type,
      latitude: row.latitude,
      longitude: row.longitude,
    }));
  }
}
