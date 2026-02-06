import {ApiProperty} from '@nestjs/swagger';
import {ProjectType} from '../enums/project-type.enum.js';
import {SessionMode} from '../enums/session-mode.enum.js';

/** DTO for project details response */
export class ProjectInfoResponseDto {
  @ApiProperty({description: 'Unique identifier of the project'})
  projectId!: string;

  @ApiProperty({description: 'Human‑readable name of the project'})
  name!: string;

  @ApiProperty({description: 'Detailed description of the project'})
  description!: string;

  @ApiProperty({
    enum: ProjectType,
    description: 'Type of the project (offline or device)',
  })
  projectType!: ProjectType;

  @ApiProperty({
    enum: SessionMode,
    description: 'Current session mode for the project',
  })
  sessionMode!: SessionMode;
}
