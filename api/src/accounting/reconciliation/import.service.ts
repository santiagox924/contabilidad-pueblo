// api/src/accounting/reconciliation/import.service.ts
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import {
  BankImporter,
  ParsedLine,
  RawRow,
  normalizeHeader,
  toDate,
  toNumber,
} from './importers/importer.interface';

// Nota: si tienes PrismaService ya envuelto, cámbialo por tu servicio
// Aquí uso PrismaClient directo por simplicidad.
const prisma = new PrismaClient();

/**
 * Importador genérico por encabezados comunes:
 * date/fecha, description/descripción, reference/ref, amount/monto/valor, balance/saldo
 */
const GenericImporter: BankImporter = {
  bank: 'Generic',
  canHandle: (_fileName, sample) => {
    const headers = sample.length ? Object.keys(sample[0]) : [];
    const norm = headers.map(normalizeHeader);
    const hasDate = norm.some((h) => /(^|_)(date|fecha)(_|$)/.test(h));
    const hasAmount = norm.some((h) =>
      /(^|_)(amount|monto|valor)(_|$)/.test(h),
    );
    return hasDate && hasAmount;
  },
  parse: (rows) => {
    const out: ParsedLine[] = [];
    for (const r of rows) {
      // normaliza headers
      const n: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) n[normalizeHeader(k)] = v;

      const d = toDate(n['date'] ?? n['fecha']);
      const desc = (n['description'] ??
        n['descripcion'] ??
        n['detalle'] ??
        n['concepto']) as string | undefined;
      const ref = (n['reference'] ??
        n['ref'] ??
        n['referencia'] ??
        n['nro_documento']) as string | undefined;
      const amt = toNumber(
        n['amount'] ??
          n['monto'] ??
          n['valor'] ??
          n['importe'] ??
          n['debito_credito'],
      );
      const bal = toNumber(n['balance'] ?? n['saldo']);

      if (!d || amt == null) continue;
      out.push({
        date: d,
        description: desc?.toString(),
        reference: ref?.toString(),
        amount: amt,
        balance: bal,
      });
    }
    if (!out.length)
      throw new BadRequestException(
        'No se detectaron líneas válidas en el importador genérico',
      );
    return out;
  },
};

// Si luego creas importadores específicos, impórtalos aquí y añádelos al array:
const importers: BankImporter[] = [
  // BancolombiaImporter,
  // DaviviendaImporter,
  // BbvaImporter,
  GenericImporter,
];

@Injectable()
export class ImportService {
  /**
   * Decide si el archivo es CSV o Excel por mimetype/extensión.
   */
  private detectKind(file: Express.Multer.File): 'csv' | 'excel' {
    const name = (file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();
    if (
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mime.includes('spreadsheet')
    )
      return 'excel';
    if (name.endsWith('.csv') || mime.includes('csv') || mime.includes('text'))
      return 'csv';
    // último recurso: mirar primeras bytes por ; , etc — pero aquí devolvemos csv por defecto
    return 'csv';
  }

  /**
   * Lee el archivo a filas RawRow[] con headers normalizados del archivo.
   * - Para CSV: usa csv-parse/sync
   * - Para Excel: usa xlsx, toma la primera hoja con datos
   */
  private readRows(file: Express.Multer.File): RawRow[] {
    const kind = this.detectKind(file);
    if (kind === 'csv') {
      const text = file.buffer.toString('utf8');
      const recs = csvParse<RawRow>(text, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        bom: true,
      });
      return recs;
    } else {
      const wb = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName)
        throw new BadRequestException('El Excel no contiene hojas');
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<RawRow>(ws, { raw: false });
      return json;
    }
  }

  /**
   * Selecciona importador:
   * - Si llega bank y coincide => ese
   * - Si no, prueba heurística canHandle con la muestra de filas
   */
  private pickImporter(
    fileName: string,
    maybeBank: string | undefined,
    sample: RawRow[],
  ): BankImporter {
    if (maybeBank) {
      const chosen = importers.find(
        (i) => i.bank.toLowerCase() === maybeBank.toLowerCase(),
      );
      if (chosen) return chosen;
    }
    const byHeuristic = importers.find((i) => {
      try {
        return i.canHandle(fileName, sample);
      } catch {
        return false;
      }
    });
    if (!byHeuristic)
      throw new BadRequestException(
        'No se encontró un importador que pueda manejar este archivo',
      );
    return byHeuristic;
  }

  /**
   * Hash de archivo para deduplicar (sha256 del buffer completo)
   */
  private fileHash(buf: Buffer) {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Persiste encabezado + líneas con create + createMany
   */
  private async persist(
    meta: {
      bank: string;
      accountNumber?: string;
      currency?: string;
      originalFileName: string;
      fileHash: string;
      startDate?: Date;
      endDate?: Date;
    },
    lines: ParsedLine[],
  ) {
    // Deduplicado
    const exists = await prisma.bankStatement.findUnique({
      where: { fileHash: meta.fileHash },
    });
    if (exists) {
      throw new ConflictException(
        'El archivo ya fue importado (hash duplicado)',
      );
    }

    // Determinar rango de fechas si no vino
    const dates = lines.map((l) => l.date.valueOf()).sort((a, b) => a - b);
    const start = meta.startDate ?? new Date(dates[0]);
    const end = meta.endDate ?? new Date(dates[dates.length - 1]);

    // Inserción
    const created = await prisma.bankStatement.create({
      data: {
        bank: meta.bank,
        accountNumber: meta.accountNumber,
        currency: meta.currency,
        originalFileName: meta.originalFileName,
        fileHash: meta.fileHash,
        startDate: start,
        endDate: end,
        status: 'parsed',
      },
    });

    if (!lines.length) return { statement: created, count: 0 };

    // Preparar createMany
    const data: Prisma.BankStatementLineCreateManyInput[] = lines.map((l) => ({
      statementId: created.id,
      date: l.date,
      description: l.description ?? null,
      reference: l.reference ?? null,
      amount: new Prisma.Decimal(l.amount),
      balance: l.balance != null ? new Prisma.Decimal(l.balance) : null,
      externalId: l.externalId ?? null,
      matchScore: null,
      matchedLineId: null,
      notes: null,
    }));

    const res = await prisma.bankStatementLine.createMany({
      data,
      skipDuplicates: false,
    });
    return { statement: created, count: res.count };
  }

  /**
   * Entrada pública desde el controlador
   */
  async handleImport(file: Express.Multer.File, bank?: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Archivo vacío');

    const rows = this.readRows(file);
    if (!rows.length) throw new BadRequestException('No se encontraron filas');

    // Muestra para heurística (hasta 10 filas)
    const sample = rows.slice(0, 10);

    const importer = this.pickImporter(file.originalname, bank, sample);
    const parsed = importer.parse(rows);

    // Normalización final por si el importador no lo hizo (signos, etc.)
    const normalized = parsed
      .map((l) => this.normalizeParsedLine(l))
      .filter(Boolean) as ParsedLine[];
    if (!normalized.length)
      throw new BadRequestException('No se generaron líneas válidas');

    const fileHash = this.fileHash(file.buffer);

    // Meta: intenta inferir banco de importer si no vino bank
    const effectiveBank = bank ?? importer.bank;

    // Persistir
    const result = await this.persist(
      {
        bank: effectiveBank,
        originalFileName: file.originalname,
        fileHash,
      },
      normalized,
    );

    return {
      statementId: result.statement.id,
      bank: result.statement.bank,
      startDate: result.statement.startDate,
      endDate: result.statement.endDate,
      linesImported: result.count,
      status: result.statement.status,
    };
  }

  /**
   * Normaliza una ParsedLine (asegura Date válida y number)
   */
  private normalizeParsedLine(l: ParsedLine): ParsedLine | undefined {
    const date = l.date instanceof Date ? l.date : toDate(l.date as any);
    const amount =
      typeof l.amount === 'number' ? l.amount : toNumber(l.amount as any);
    if (!date || !Number.isFinite(amount as number)) return undefined;

    const balance =
      l.balance == null
        ? undefined
        : typeof l.balance === 'number'
          ? l.balance
          : toNumber(l.balance as any);

    let description = l.description?.toString().trim();
    if (description === '') description = undefined;

    let reference = l.reference?.toString().trim();
    if (reference === '') reference = undefined;

    let externalId = l.externalId?.toString().trim();
    if (externalId === '') externalId = undefined;

    return {
      date,
      description,
      reference,
      amount: amount as number,
      balance,
      externalId,
    };
  }

  /**
   * Listar extractos con paginación y filtro por banco
   */
  async listStatements(params: { bank?: string; skip: number; take: number }) {
    const where: Prisma.BankStatementWhereInput = params.bank
      ? { bank: { contains: params.bank, mode: 'insensitive' } }
      : {};
    const [items, total] = await Promise.all([
      prisma.bankStatement.findMany({
        where,
        orderBy: { uploadedAt: 'desc' },
        skip: params.skip,
        take: params.take,
      }),
      prisma.bankStatement.count({ where }),
    ]);
    return { total, items };
  }

  /**
   * Obtener líneas de un extracto
   */
  async getStatementLines(statementId: number) {
    const statement = await prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!statement) throw new NotFoundException('Extracto no encontrado');
    const lines = await prisma.bankStatementLine.findMany({
      where: { statementId },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });
    return { statement, lines };
  }

  /**
   * Eliminar extracto y sus líneas
   */
  async deleteStatement(statementId: number) {
    const statement = await prisma.bankStatement.findUnique({
      where: { id: statementId },
    });
    if (!statement) throw new NotFoundException('Extracto no encontrado');
    // onDelete: Cascade en relación BankStatement -> BankStatementLine
    await prisma.bankStatement.delete({ where: { id: statementId } });
    return { deleted: true };
  }
}
