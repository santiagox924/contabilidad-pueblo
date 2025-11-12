// api/src/common/geo/geo.controller.ts
import { Controller, Get, Query } from '@nestjs/common';

import { GeoService } from './geo.service';
import { SearchMunicipalitiesDto } from './dto/search-municipalities.dto';

@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('municipalities')
  searchMunicipalities(@Query() query: SearchMunicipalitiesDto) {
    return this.geo.searchMunicipalities(query);
  }
}
