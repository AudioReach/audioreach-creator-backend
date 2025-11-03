import { Module } from '@nestjs/common';
import { ModuleDefinitionController } from './module-definition.controller.js';

@Module({
  controllers: [ModuleDefinitionController]
})
export class ModuleDefinitionModule {}
