import { Module } from '@nestjs/common';
import { ContainerController } from './contianer.controller.js';

@Module({
    controllers: [ContainerController],
    providers: [],
    exports: []
})
export class ContainerModule {}
