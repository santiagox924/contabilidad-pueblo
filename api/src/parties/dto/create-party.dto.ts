import { IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreatePartyDto {
  @IsIn(['CLIENT', 'PROVIDER', 'EMPLOYEE', 'OTHER'])
  type!: 'CLIENT' | 'PROVIDER' | 'EMPLOYEE' | 'OTHER';

  @IsOptional()
  @Matches(/^[A-Za-z0-9\-\._]{4,30}$/)
  document?: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;

  @IsOptional() @IsInt() @Min(0)
  paymentTermsDays?: number;
}
