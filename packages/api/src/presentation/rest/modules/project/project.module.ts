import { Module } from '@nestjs/common';
import { ProjectController } from './project.controller.js';


@Module({
  controllers: [ProjectController]
})
export class ProjectModule { }
