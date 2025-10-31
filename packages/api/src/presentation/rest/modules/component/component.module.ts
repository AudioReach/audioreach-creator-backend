import { Module } from '@nestjs/common';
import { ComponentController } from './component.controller.js';

/**
 * Module for component-related functionality
 * Converted from C# UseCaseDesignController (component part)
 */
@Module({
  controllers: [ComponentController],
  providers: [],
  exports: []
})
export class ComponentModule {}
