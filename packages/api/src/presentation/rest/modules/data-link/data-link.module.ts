import {Module} from '@nestjs/common';
import {DataLinkController} from './data-link.controller.js';

@Module({
  controllers: [DataLinkController],
  providers: [],
  exports: [],
})
export class DataLinkModule {}
