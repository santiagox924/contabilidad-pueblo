import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PartiesService } from './parties.service';
import { CreatePartyDto } from './dto/create-party.dto';
import { UpdatePartyDto } from './dto/update-party.dto';

@UseGuards(JwtAuthGuard)
@Controller('parties')
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  @Get()
  findAll() {
    return this.parties.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.parties.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePartyDto, @Req() req: any) {
    const userId = req.user?.userId as number | undefined;
    return this.parties.create(dto, userId);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePartyDto, @Req() req: any) {
    const userId = req.user?.userId as number | undefined;
    return this.parties.update(id, dto, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    const userId = req.user?.userId as number | undefined;
    return this.parties.remove(id, userId);
  }
}
