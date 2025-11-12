import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type CalendarFilters = {
  year?: string;
  obligation?: string;
  regime?: string;
  municipality?: string;
  department?: string;
};

@Injectable()
export class FiscalService {
  constructor(private readonly prisma: PrismaService) {}

  async listCalendars(filters: CalendarFilters) {
    const year = filters.year ? Number(filters.year) : new Date().getFullYear();
    const where: Record<string, any> = { year };
    if (filters.obligation) where.obligation = filters.obligation;
    if (filters.regime) where.regime = filters.regime;
    if (filters.municipality) where.municipalityCode = filters.municipality;
    if (filters.department) where.departmentCode = filters.department;

    const calendars = await (this.prisma as any).fiscalCalendar.findMany({
      where,
      include: { events: { orderBy: { dueDate: 'asc' } } },
      orderBy: [{ obligation: 'asc' }, { municipalityCode: 'asc' }],
    });

    return calendars.map((cal: any) => ({
      id: cal.id,
      year: cal.year,
      obligation: cal.obligation,
      periodicity: cal.periodicity,
      regime: cal.regime,
      municipalityCode: cal.municipalityCode,
      departmentCode: cal.departmentCode,
      notes: cal.notes,
      events: cal.events.map((ev: any) => ({
        id: ev.id,
        periodLabel: ev.periodLabel,
        dueDate: ev.dueDate,
        cutoffDate: ev.cutoffDate,
        dianForm: ev.dianForm,
        channel: ev.channel,
      })),
    }));
  }
}
