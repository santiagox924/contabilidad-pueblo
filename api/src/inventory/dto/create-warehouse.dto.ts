import { IsString, Length, Matches } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @Length(3, 50)
  @Matches(/^[A-Za-z0-9 áéíóúÁÉÍÓÚñÑ\-_.]+$/)
  name!: string;
}
