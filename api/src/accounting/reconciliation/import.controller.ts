// api/src/accounting/reconciliation/import.controller.ts
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';

@Controller('accounting/reconciliation')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  /**
   * POST /accounting/reconciliation/import
   * multipart/form-data: file (required), bank (optional)
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('bank') bank?: string,
  ) {
    if (!file) throw new BadRequestException('file es requerido');
    return this.importService.handleImport(file, bank);
  }

  /**
   * GET /accounting/reconciliation/statements
   * Lista paginada de extractos (opcionalmente por banco)
   */
  @Get('statements')
  async listStatements(
    @Query('bank') bank?: string,
    @Query('skip') skip = '0',
    @Query('take') take = '50',
  ) {
    return this.importService.listStatements({
      bank,
      skip: Math.max(0, parseInt(skip, 10) || 0),
      take: Math.min(200, Math.max(1, parseInt(take, 10) || 50)),
    });
  }

  /**
   * GET /accounting/reconciliation/statements/:id/lines
   */
  @Get('statements/:id/lines')
  async getStatementLines(@Param('id', ParseIntPipe) id: number) {
    return this.importService.getStatementLines(id);
  }

  /**
   * DELETE /accounting/reconciliation/statements/:id
   */
  @Delete('statements/:id')
  async deleteStatement(@Param('id', ParseIntPipe) id: number) {
    return this.importService.deleteStatement(id);
  }
}
