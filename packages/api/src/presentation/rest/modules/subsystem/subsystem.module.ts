import {Module} from '@nestjs/common';
import {SubsystemController} from './subsystem.controller.js';

/**
 * Module for subsystem functionality
 */
@Module({
  controllers: [SubsystemController],
  providers: [],
  exports: [],
})
export class SubsystemModule {}
