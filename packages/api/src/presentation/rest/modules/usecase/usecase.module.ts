import {Module} from '@nestjs/common';
import {UseCaseController} from './usecase.controller.js';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';

/**
 * Module for usecase functionality
 */
@Module({
  imports: [ArcCqrsModule],
  controllers: [UseCaseController],
})
export class UseCaseModule {}
