import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class SetPinDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  /**
   * Preuve de possession du numéro, délivrée par /auth/verify-otp après
   * validation d'un OTP. Sans ce jeton, connaître un numéro suffisait à
   * définir le code PIN du compte et à en obtenir les jetons d'accès.
   */
  @IsString()
  @IsNotEmpty({
    message: 'Session expirée. Recommencez la vérification du code.',
  })
  setup_token: string;

  @IsString()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'PIN must be numeric' })
  pin: string;
}
