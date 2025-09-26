import { ApiProperty } from '@nestjs/swagger';
import { FileInfo } from './file-info.dto.js';

/** DTO for downloading ARC database files */
export class DownloadArcDatabaseFilesResponse {
  
  @ApiProperty({ description: 'Acdb file information' })
  acdbFile!: FileInfo;

  @ApiProperty({ description: 'Workspace file information' })
  workspaceFile!: FileInfo;
}
