import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Patch,
  Query,
} from '@nestjs/common';
import { FixedAssetsService } from './fixed-assets.service';
import {
  CreateFixedAssetBatchDto,
  CreateFixedAssetDto,
} from './dto/create-fixed-asset.dto';
import { RunDepreciationDto } from './dto/run-depreciation.dto';
import {
  CreateFixedAssetCategoryDto,
  UpdateFixedAssetCategoryDto,
} from './dto/create-fixed-asset-category.dto';
import {
  CreateFixedAssetLocationDto,
  UpdateFixedAssetLocationDto,
} from './dto/create-fixed-asset-location.dto';
import {
  CreateFixedAssetPolicyDto,
  UpdateFixedAssetPolicyDto,
} from './dto/create-fixed-asset-policy.dto';
import { RegisterImprovementDto } from './dto/register-improvement.dto';
import { DisposeFixedAssetDto } from './dto/dispose-fixed-asset.dto';

@Controller('fixed-assets')
export class FixedAssetsController {
  constructor(private readonly fixedAssets: FixedAssetsService) {}

  @Get()
  list() {
    return this.fixedAssets.listAssets();
  }

  @Get('categories')
  listCategories() {
    return this.fixedAssets.listCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateFixedAssetCategoryDto) {
    return this.fixedAssets.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFixedAssetCategoryDto,
  ) {
    return this.fixedAssets.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.fixedAssets.removeCategory(id);
  }

  @Get('locations')
  listLocations(): Promise<unknown> {
    return this.fixedAssets.listLocations();
  }

  @Post('locations')
  createLocation(@Body() dto: CreateFixedAssetLocationDto): Promise<unknown> {
    return this.fixedAssets.createLocation(dto);
  }

  @Patch('locations/:id')
  updateLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFixedAssetLocationDto,
  ): Promise<unknown> {
    return this.fixedAssets.updateLocation(id, dto);
  }

  @Delete('locations/:id')
  removeLocation(@Param('id', ParseIntPipe) id: number) {
    return this.fixedAssets.removeLocation(id);
  }

  @Get('policies')
  listPolicies() {
    return this.fixedAssets.listPolicies();
  }

  @Post('policies')
  createPolicy(@Body() dto: CreateFixedAssetPolicyDto) {
    return this.fixedAssets.createPolicy(dto);
  }

  @Patch('policies/:id')
  updatePolicy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFixedAssetPolicyDto,
  ) {
    return this.fixedAssets.updatePolicy(id, dto);
  }

  @Delete('policies/:id')
  removePolicy(@Param('id', ParseIntPipe) id: number) {
    return this.fixedAssets.removePolicy(id);
  }

  @Get(':id')
  getOne(@Param('id', ParseIntPipe) id: number) {
    return this.fixedAssets.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateFixedAssetDto) {
    return this.fixedAssets.create(dto);
  }

  @Post('batch')
  createBatch(@Body() dto: CreateFixedAssetBatchDto) {
    return this.fixedAssets.createBatch(dto);
  }

  @Post(':id/improvements')
  registerImprovement(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterImprovementDto,
  ) {
    return this.fixedAssets.registerImprovement(id, dto);
  }

  @Post(':id/disposals')
  dispose(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DisposeFixedAssetDto,
  ) {
    return this.fixedAssets.disposeAsset(id, dto);
  }

  @Get(':id/schedule')
  previewSchedule(
    @Param('id', ParseIntPipe) id: number,
    @Query('months', new DefaultValuePipe(12), ParseIntPipe) months: number,
  ) {
    return this.fixedAssets.previewSchedule(id, months);
  }

  @Post('depreciation/run')
  runDepreciation(@Body() dto: RunDepreciationDto) {
    return this.fixedAssets.runDepreciation(dto);
  }
}
