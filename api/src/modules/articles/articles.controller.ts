import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums';
import { User } from '../users/entities/user.entity';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleQueryDto } from './dto/article-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Public()
  @Get()
  list(@Query() query: ArticleQueryDto) {
    return this.articlesService.listArticles(query);
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.articlesService.getArticleDetail(id);
  }

  @Roles(Role.VENDOR)
  @Get('vendor/articles')
  getVendorArticles(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('per_page') perPage?: string,
  ) {
    return this.articlesService.getVendorArticles(
      user,
      page ? parseInt(page) : 1,
      perPage ? parseInt(perPage) : 50,
    );
  }

  @Roles(Role.VENDOR)
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateArticleDto) {
    return this.articlesService.createArticle(user, dto);
  }

  @Roles(Role.VENDOR)
  @Put(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    return this.articlesService.updateArticle(user, id, dto);
  }

  @Roles(Role.VENDOR)
  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.articlesService.deleteArticle(user, id);
  }

  @Roles(Role.VENDOR)
  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('photo', { storage: memoryStorage() }))
  uploadPhoto(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('is_cover') isCover?: string,
  ) {
    return this.articlesService.uploadPhoto(user, id, file, isCover === 'true');
  }

  @Roles(Role.VENDOR)
  @Delete(':id/photos/:photoId')
  deletePhoto(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Param('photoId') photoId: string,
  ) {
    return this.articlesService.deletePhoto(user, id, photoId);
  }
}
