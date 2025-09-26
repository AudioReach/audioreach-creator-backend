import { ApiProperty } from '@nestjs/swagger';

/** DTO for updating project information */
export class UpdateProjectInfoRequest {

  @ApiProperty({ required: false, description: 'Optional new name for the project' })
  projectName?: string;

  @ApiProperty({ required: false, description: 'Optional new description for the project' })
  projectDescription?: string;

  @ApiProperty({ required: false, description: 'Optional description for a diff‑merge operation' })
  diffMergeDescription?: string;
}
