import { Module } from '@nestjs/common';
import { KeyDefinitionController } from './key-definition.controller.js';

@Module({
  controllers: [KeyDefinitionController]
})
export class KeyDefinitionModule {}
