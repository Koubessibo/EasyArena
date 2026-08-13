import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class CartItemDto {
  @IsUUID('4')
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  @IsNotEmpty()
  quantity: number;
}

export class CheckoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  cartItems: CartItemDto[];

  @IsString()
  @IsNotEmpty()
  paymentPhone: string;

  @IsString()
  @IsOptional()
  operator?: string;
}
