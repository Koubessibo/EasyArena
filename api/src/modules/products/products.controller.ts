import { Body, Controller, Get, Param, Patch, Post, Put, Delete, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Public } from '../../common/decorators/public.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
  ) {}

  @Roles(Role.VENDOR)
  @Get('vendor')
  async getVendorProducts(@CurrentUser() user: User) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const products = await this.productsService.getVendorProducts(vendorId);
    return {
      success: true,
      data: products,
    };
  }

  @Public()
  @Get()
  async getActiveProducts() {
    const products = await this.productsService.getActiveProducts();
    return {
      success: true,
      data: products,
    };
  }

  @Public()
  @Get(':id')
  async getProductById(@Param('id') id: string) {
    const product = await this.productsService.getProductById(id);
    return {
      success: true,
      data: product,
    };
  }

  @Roles(Role.VENDOR)
  @Post()
  async createProduct(@Body() dto: CreateProductDto, @CurrentUser() user: User) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const product = await this.productsService.createProduct(dto, vendorId);
    return {
      success: true,
      message: 'Produit ajouté avec succès',
      data: product,
    };
  }

  @Roles(Role.VENDOR)
  @Put(':id')
  async updateProduct(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: User,
  ) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const product = await this.productsService.updateProduct(id, dto, vendorId);
    return {
      success: true,
      message: 'Produit mis à jour avec succès',
      data: product,
    };
  }

  @Roles(Role.VENDOR)
  @Delete(':id')
  async deleteProduct(@Param('id') id: string, @CurrentUser() user: User) {
    const vendorId = await this.usersService.resolveVendorId(user);
    await this.productsService.deleteProduct(id, vendorId);
    return {
      success: true,
      message: 'Produit supprimé avec succès',
    };
  }

  @Roles(Role.VENDOR)
  @Patch(':id/stock')
  async updateStock(
    @Param('id') productId: string,
    @Body('quantity', ParseIntPipe) quantity: number,
    @CurrentUser() user: User
  ) {
    const vendorId = await this.usersService.resolveVendorId(user);
    const product = await this.productsService.updateStock(productId, vendorId, quantity);
    return {
      success: true,
      message: 'Stock mis à jour',
      data: product,
    };
  }
}
