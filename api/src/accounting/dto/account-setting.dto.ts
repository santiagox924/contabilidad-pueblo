// api/src/accounting/dto/account-setting.dto.ts
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class UpdateAccountSettingDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 32)
  accountCode!: string;
}
