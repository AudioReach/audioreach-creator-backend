import {Module} from '@nestjs/common';
import {SubsystemController} from './subsystem.controller.js';

/**
 * Module for subsystem functionality
 * Converted from C# UseCaseDesignController class
 */
@Module({
  controllers: [SubsystemController],
  providers: [],
  exports: [],
})
export class SubsystemModule {}
