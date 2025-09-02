import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  findAll() {
    return this.items.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.items.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateItemDto) {
    return this.items.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateItemDto) {
    return this.items.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.items.remove(id);
  }
}
