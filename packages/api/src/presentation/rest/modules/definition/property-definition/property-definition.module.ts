import { Module } from '@nestjs/common';
import { PropertyDefinitionController } from './property-definition.controller.js';

@Module({
  controllers: [PropertyDefinitionController]
})
export class PropertyDefinitionModule {}
