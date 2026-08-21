import { IsEnum, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { PlatformWithdrawalMethod } from '../entities/platform-withdrawal.entity';

export class CreatePlatformWithdrawalDto {
  @IsNumber()
  @Min(1, { message: 'Le montant du retrait doit être supérieur à 0 FCFA' })
  amount: number;

  @IsEnum(PlatformWithdrawalMethod, { message: 'Méthode de retrait invalide' })
  method: PlatformWithdrawalMethod;

  @IsString()
  @IsNotEmpty({ message: 'Le numéro de compte ou téléphone est requis' })
  accountDetails: string;
}
