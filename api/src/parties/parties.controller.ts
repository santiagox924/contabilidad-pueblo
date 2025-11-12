// api/src/parties/parties.controller.ts
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
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';
import { PartyType } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('parties')
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  @Get()
  @Get()
  findAll(@Query('role') role?: PartyType) {
    return this.parties.findAll(role);
  }

  /** 👈 Esta ruta debe ir antes de :id */
  @Get('by-document')
  findByDocument(@Query('document') document: string) {
    return this.parties.findByDocument(document);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.parties.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePartyDto, @Req() req: any) {
    const raw = req.user;
    const userId = Number(raw?.id ?? raw?.sub ?? raw?.userId) || undefined;
    return this.parties.create(dto, userId);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartyDto,
    @Req() req: any,
  ) {
    const raw = req.user;
    const userId = Number(raw?.id ?? raw?.sub ?? raw?.userId) || undefined;
    return this.parties.update(id, dto, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const raw = req.user;
    const userId = Number(raw?.id ?? raw?.sub ?? raw?.userId) || undefined;
    return this.parties.remove(id, userId);
  }
}
