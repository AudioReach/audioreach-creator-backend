import { Module } from '@nestjs/common';
import { ModuleInstanceController } from './module-instance.controller.js';

/**
 * Module for module instance functionality
 * Converted from C# UseCaseDesignController class
 */
@Module({
    controllers: [ModuleInstanceController],
    providers: [],
    exports: []
})
export class ModuleInstanceModule {}
