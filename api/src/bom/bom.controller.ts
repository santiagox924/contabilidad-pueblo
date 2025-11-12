// api/src/bom/bom.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BomService } from './bom.service';
import { UpsertRecipeDto } from './dto/upsert-recipe.dto';
import { ExplodeRequestDto } from './dto/explode.dto';

@UseGuards(JwtAuthGuard)
@Controller('bom')
export class BomController {
  constructor(private readonly bom: BomService) {}

  /** Obtiene la receta activa de un ítem de salida */
  @Get(':itemId')
  getRecipe(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.bom.getRecipe(itemId);
  }

  /** PUT por ID (URL) – no depende del body para el parent */
  @Put(':itemId')
  upsertById(
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() dto: UpsertRecipeDto,
  ) {
    return this.bom.upsertRecipe({
      parentItemId: itemId,
      parentSku: dto.parentSku, // ignorado si viene parentItemId
      name: dto.name,
      isActive: dto.isActive,
      components: dto.components, // cada componente puede incluir unit (G/KG/ML/L) y wastePct
    });
  }

  /** PUT por SKU en la URL – útil si trabajas solo con códigos */
  @Put('sku/:parentSku')
  upsertBySku(
    @Param('parentSku') parentSku: string,
    @Body() dto: UpsertRecipeDto,
  ) {
    return this.bom.upsertRecipe({
      parentSku,
      name: dto.name,
      isActive: dto.isActive,
      components: dto.components,
    });
  }

  /**
   * POST alternativo (compat con InventoryPage/saveBom):
   * No tipamos con UpsertRecipeDto para que NO se filtren itemId/componentes.itemId
   * por ValidationPipe({ whitelist:true }).
   */
  @Post()
  create(@Body() raw: any) {
    // Pasamos el body tal cual y el service ya normaliza:
    // - parentItemId|parentSku
    // - o itemId (front) y components[].itemId
    return this.bom.upsertRecipe(raw);
  }

  /** Desactiva (soft-delete) la receta activa de un ítem */
  @Delete(':itemId')
  deactivate(@Param('itemId', ParseIntPipe) itemId: number) {
    return this.bom.deactivateRecipe(itemId);
  }

  /**
   * Explota requerimientos (BOM recursivo). Si se pasa warehouseId,
   * primero consume stock de intermedios.
   */
  @Post('explode')
  explode(@Body() dto: ExplodeRequestDto) {
    return this.bom.explodeRequirements(dto);
  }

  /** Costo de una receta por unidad de salida */
  @Get('recipes/:id/cost')
  recipeCost(@Param('id', ParseIntPipe) id: number) {
    return this.bom.costOfRecipe(id);
  }
}
