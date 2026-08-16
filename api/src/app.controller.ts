import { Controller, Get, Head } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  getRoot() {
    return {
      status: 'ok',
      service: 'EasyArena API',
      version: '2.1.0',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Head()
  headRoot() {
    return;
  }
}
