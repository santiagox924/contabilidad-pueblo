import { IsIn, IsString, Length, Matches } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Matches(/^[0-9]{3,20}$/)
  code!: string;

  @IsString()
  @Length(3, 120)
  name!: string;

  @IsIn(['D', 'C'])
  nature!: 'D' | 'C';
}