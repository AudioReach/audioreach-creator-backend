import { Module } from '@nestjs/common';
import { ControlLinkController } from './control-link.controller.js';

@Module({
    controllers: [ControlLinkController],
    providers: [],
    exports: []
})
export class ControlLinkModule {}
