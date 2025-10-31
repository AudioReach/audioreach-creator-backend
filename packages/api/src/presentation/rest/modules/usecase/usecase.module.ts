import { Module } from '@nestjs/common';
import { UseCaseController } from './usecase.controller.js';

/**
 * Module for usecase functionality
 */
@Module({
    controllers: [UseCaseController],
})
export class UseCaseModule { }
