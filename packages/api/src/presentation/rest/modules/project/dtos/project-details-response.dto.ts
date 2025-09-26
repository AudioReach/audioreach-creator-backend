import { ApiProperty } from '@nestjs/swagger';
import { DiffMergeProjectDetails } from './diff-merge-project-details.dto.js';
import { ActiveDeviceDetails } from './active-device-detail.dto.js';


export enum ProjectType {
  Offline = "OFFLINE",
  Device = "DEVICE"

}


export enum SessionMode {
  DiffMerge = "DIFF_MERGE",
  Designer = "DESIGNER",
  Simulation = "SIMULATION",
  Connected = "CONNECTED",
  Disconnected = "DISCONNECTED"
}

/** DTO for project details response */
export class ProjectDetails {

  @ApiProperty({ description: 'Unique identifier of the project' })
  projectId!: string;

  @ApiProperty({ description: 'Human‑readable name of the project' })
  projectName!: string;

  @ApiProperty({ description: 'Detailed description of the project' })
  projectDescription!: string;

  @ApiProperty({ enum: ProjectType, description: 'Type of the project (offline or device)' })
  projectType!: ProjectType;

  @ApiProperty({ enum: SessionMode, description: 'Current session mode for the project' })
  sessionMode!: SessionMode;

  @ApiProperty({ required: false, description: 'Information about the active device, if any' })
  activeDeviceInfo?: ActiveDeviceDetails;

  @ApiProperty({ required: false, description: 'Details of a diff‑merge operation, if applicable' })
  diffMerge?: DiffMergeProjectDetails;


}
