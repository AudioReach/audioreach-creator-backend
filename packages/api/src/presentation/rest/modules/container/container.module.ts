import {Module} from '@nestjs/common';
import {ContainerController} from './container.controller.js';

@Module({
  controllers: [ContainerController],
  providers: [],
  exports: [],
})
export class ContainerModule {}
