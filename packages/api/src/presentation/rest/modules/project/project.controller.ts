import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  ProjectDetails,
  ProjectType,
  SessionMode,
} from './dtos/project-details-response.dto.js';
import {
  FileFieldsInterceptor,
  FilesInterceptor,
} from '@nestjs/platform-express';
import {UpdateProjectInfoRequest} from './dtos/update-project-info-request.dto.js';
import {DownloadArcDatabaseFilesResponse} from './dtos/download-arc-database-files-response.dto.js';
import type {Multer} from 'multer';
import multer from 'multer';
import {AuthGuard} from '@nestjs/passport';
import {DeviceDetailInfo} from './dtos/device-detail-info.dto.js';
import {ConnectToDeviceRequest} from './dtos/connect-to-device-request.dto.js';
import {ApiResult} from '../../common/dtos/api-response.dto.js';
import {DeviceInfo} from './dtos/device-info.dto.js';
import {CommandBus, OpenFileCommand} from '@arc/core';
import type {FileRef} from '@arc/core';
import {promises as fsPromises} from 'fs';
import * as os from 'os';
import * as path from 'path';

@Controller('arcapi/v1/')
@UseGuards(AuthGuard('jwt'))
export class ProjectController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('/offline/files')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Open acdb and workspace files',
    description:
      'Creating a new project while opening acdb and workspace files',
  })
  @ApiExtraModels(ApiResult, ProjectDetails)
  @ApiResponse({
    description: 'File opened successfully',
    status: HttpStatus.CREATED,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectDetails)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  @ApiBody({
    description: 'Upload two required files: acdbFile and workspaceFile',
    schema: {
      type: 'object',
      properties: {
        projectName: {type: 'string'},
        projectDescription: {type: 'string'},
        acdbFile: {type: 'string', format: 'binary'},
        workspaceFile: {type: 'string', format: 'binary'},
      },
      required: ['acdbFile', 'workspaceFile'],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        {name: 'acdbFile', maxCount: 1},
        {name: 'workspaceFile', maxCount: 1},
      ],
      {
        storage: multer.memoryStorage(),
        limits: {
          fileSize: 10 * 1024 * 1024, // 10MB limit per file
        },
      },
    ),
  )
  async uploadArcDbFiles(
    @UploadedFiles()
    files: {
      acdbFile: Express.Multer.File;
      workspaceFile: Express.Multer.File;
    },
    @Body() _updateProjectInfoRequest: UpdateProjectInfoRequest,
  ): Promise<ApiResult<ProjectDetails>> {
    const clientId = ''; //TODO: gather from jwt
    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }

    const acdb = files?.acdbFile;
    const awsp = files?.workspaceFile;

    if (!acdb || !awsp) {
      throw new BadRequestException(
        'Both acdbFile and workspaceFile are required',
      );
    }

    // Validate extensions early
    const acdbName = acdb.originalname?.toLowerCase() ?? '';
    const awspName = awsp.originalname?.toLowerCase() ?? '';
    if (!acdbName.endsWith('.acdb')) {
      throw new BadRequestException(
        'Invalid acdb file extension; expected .acdb',
      );
    }
    if (!awspName.endsWith('.awsp')) {
      throw new BadRequestException(
        'Invalid workspace file extension; expected .awsp',
      );
    }

    const tmpDir = os.tmpdir();
    const acdbPath = path.join(tmpDir, `${Date.now()}-${acdb.originalname}`);
    const awspPath = path.join(tmpDir, `${Date.now()}-${awsp.originalname}`);

    let acdbRef: FileRef;
    let awspRef: FileRef;

    try {
      // Write Multer buffers to temp files
      await fsPromises.writeFile(acdbPath, acdb.buffer);
      await fsPromises.writeFile(awspPath, awsp.buffer);

      acdbRef = {
        kind: 'path',
        name: acdb.originalname,
        mimeType: acdb.mimetype,
        uri: acdbPath,
      };
      awspRef = {
        kind: 'path',
        name: awsp.originalname,
        mimeType: awsp.mimetype,
        uri: awspPath,
      };
    } catch (error) {
      // Log error and clean up any created files
      console.error('Failed to write temporary files:', error);
      await Promise.allSettled([
        fsPromises.unlink(acdbPath).catch(() => {}),
        fsPromises.unlink(awspPath).catch(() => {}),
      ]);
      throw new BadRequestException('Failed to process uploaded files');
    }

    try {
      // Dispatch command
      const result = await this.commandBus.execute<any>(
        new OpenFileCommand(clientId, acdbRef, awspRef),
      );

      // Cleanup on success
      await Promise.allSettled([
        fsPromises.unlink(acdbPath),
        fsPromises.unlink(awspPath),
      ]);

      const projectdetails: ProjectDetails = {
        projectId: result?.projectId ?? '',
        projectName: result?.projectName ?? '',
        projectDescription: result?.projectDescription ?? '',
        projectType: ProjectType.Offline,
        sessionMode: SessionMode.Designer,
      };

      const projectResponse: ApiResult<ProjectDetails> = {
        data: projectdetails,
        success: true,
        message: 'The file has been opened successfully',
      };
      return projectResponse;
    } catch (error) {
      // Keep temp files for debugging; log absolute paths
      // eslint-disable-next-line no-console
      console.error(
        'Open offline files failed. Temp files preserved:',
        acdbPath,
        awspPath,
        error,
      );
      throw error;
    }
  }

  @Get('projects')
  @ApiOperation({
    summary: 'Get all active projects',
    description: 'Provides the list of all active projects',
  })
  @ApiExtraModels(ApiResult, ProjectDetails)
  @ApiResponse({
    description: 'Successfully retrieved all projects',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {$ref: getSchemaPath(ProjectDetails)},
            },
          },
        },
      ],
    },
  })
  async getProjects(): Promise<ApiResult<ProjectDetails[]>> {
    // return list of active projects
    const projectdetails: ProjectDetails[] = [];
    await Promise.resolve();
    const projectResponses: ApiResult<ProjectDetails[]> = {
      data: projectdetails,
      success: true,
      message: 'Successfully fetch projects',
    };
    return projectResponses;
  }

  @Get('projects/:projectId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Get project information',
    description: 'Get project information based on project Id.',
  })
  @ApiExtraModels(ApiResult, ProjectDetails)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectDetails)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  async getProject(
    @Param('projectId') _projectId: string,
  ): Promise<ApiResult<ProjectDetails>> {
    const projectdetail: ProjectDetails = new ProjectDetails(); // ToDo Need to update the project Info once services ready
    await Promise.resolve();
    const projectResponse: ApiResult<ProjectDetails> = {
      data: projectdetail,
      success: true,
      message: 'Successfully fetch project',
    };
    return projectResponse;
  }

  @Patch('projects/:projectId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: UpdateProjectInfoRequest})
  @ApiOperation({
    summary: 'Update project name and description',
    description: 'Update project name and description based on project Id.',
  })
  @ApiExtraModels(ApiResult, ProjectDetails)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectDetails)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid inputs',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  async updateProjectInfo(
    @Param('projectId') _projectId: string,
    @Body() _updateProjectInfoRequest: UpdateProjectInfoRequest,
  ): Promise<ApiResult<ProjectDetails>> {
    const projectdetail: ProjectDetails = new ProjectDetails(); // ToDo Need to update the project Info once services ready
    await Promise.resolve();
    const projectResponse: ApiResult<ProjectDetails> = {
      data: projectdetail,
      success: true,
      message: '',
    };
    return projectResponse;
  }

  @Patch('projects/:projectId/connect-to-project')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Connect to existing project',
    description: 'Connect to specific project based on project Id.',
  })
  @ApiExtraModels(ApiResult, ProjectDetails)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectDetails)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  async connectToProject(
    @Param('projectId') _projectId: string,
  ): Promise<ApiResult<ProjectDetails>> {
    // Need a project Id to open the project. It will take from header

    await Promise.resolve();
    return new ApiResult<ProjectDetails>();
  }

  @Patch('projects/:projectId/disconnect-from-project')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Disconnect from the project',
    description: 'Disconnect from specific project based on project Id.',
  })
  @ApiExtraModels(ApiResult, ProjectDetails)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectDetails)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  async disconnectFromProject(
    @Param('projectId') _projectId: string,
  ): Promise<ApiResult<ProjectDetails>> {
    // Need a project Id to open the project. It will take from header

    await Promise.resolve();

    return new ApiResult<ProjectDetails>();
  }

  @Get('projects/:projectId/download')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Download the acdb and workspace files',
    description:
      'Download the acdb and workspace files based on project Id.\r\n\r\n Project Id should be the part of header of the request.',
  })
  @ApiExtraModels(ApiResult, DownloadArcDatabaseFilesResponse)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(DownloadArcDatabaseFilesResponse)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  async downloadArcDbFiles(
    @Param('projectId') _projectId: string,
  ): Promise<ApiResult<DownloadArcDatabaseFilesResponse>> {
    await Promise.resolve();
    const acdbWorkspaceFilesResponse: DownloadArcDatabaseFilesResponse =
      new DownloadArcDatabaseFilesResponse();
    const acdbWorkspaceFilesResult: ApiResult<DownloadArcDatabaseFilesResponse> =
      {
        data: acdbWorkspaceFilesResponse,
        success: true,
        message: '',
      };
    return acdbWorkspaceFilesResult;
  }

  @Delete('projects/:projectId')
  @ApiOperation({
    summary: 'Delete project',
    description: 'Deleting the project based on project Id.',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiResponse({
    description: 'Successfully deleted project',
    status: HttpStatus.NO_CONTENT,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  async deleteProject(
    @Param('projectId') _projectId: string,
  ): Promise<ApiResult<null>> {
    // Need a project Id to delete the project. It will take from header. Delete the project and clear the database for that Project Id

    await Promise.resolve();

    return new ApiResult<null>();
  }

  @Get('devices')
  @ApiOperation({
    summary: 'Get all connected devices',
    description: 'This provides the list of all connected devices',
  })
  @ApiExtraModels(ApiResult, DeviceInfo)
  @ApiResponse({
    description: 'Successfully fetched all device info',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {$ref: getSchemaPath(DeviceInfo)},
            },
          },
        },
      ],
    },
  })
  async getAllDevices(): Promise<ApiResult<DeviceInfo[]>> {
    const devicesDto: DeviceInfo[] = [];
    await Promise.resolve();
    const devicesResponse: ApiResult<DeviceInfo[]> = {
      data: devicesDto,
      success: true,
      message: 'Successfully fetch devices',
    };
    return devicesResponse;
  }

  @Get('devices/:systemId')
  @ApiParam({
    name: 'systemId',
    description: 'Id provided by system',
    required: true,
  })
  @ApiOperation({
    summary: 'Get device details',
    description: 'Get device details based on system Id.',
  })
  @ApiExtraModels(ApiResult, DeviceDetailInfo)
  @ApiResponse({
    description: 'Successfully fetched device detail info',
    status: HttpStatus.NO_CONTENT,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(DeviceDetailInfo)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Device does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  async getDeviceDetails(
    @Param('systemId') _systemId: string,
  ): Promise<ApiResult<DeviceDetailInfo>> {
    await Promise.resolve();
    const deviceDto: DeviceDetailInfo = new DeviceDetailInfo();
    const deviceResponse: ApiResult<DeviceDetailInfo> = {
      data: deviceDto,
      success: true,
      message: 'Successfully fetch devices',
    };
    return deviceResponse;
  }

  @Post('devices/:systemId/connect')
  @ApiConsumes('multipart/form-data')
  @ApiParam({name: 'systemId', description: 'Id of device', required: true})
  @ApiOperation({
    summary: 'Connect to specific device',
    description: 'Connect to the specific device based on device id',
  })
  @ApiExtraModels(ApiResult, ProjectDetails)
  @ApiResponse({
    description: 'Successfully conncted to device',
    status: HttpStatus.CREATED,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectDetails)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid inputs',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Device does not exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'object',
              nullable: true,
            },
          },
        },
      ],
    },
  })
  @ApiBody({
    description:
      'Upload the WorkspaceFile if it is not already available on the device.',
    schema: {
      type: 'object',
      properties: {
        multiAcdbClientId: {type: 'string'},
        workspaceFile: {type: 'string', format: 'binary'},
      },
    },
  })
  @UseInterceptors(FilesInterceptor('files', 1))
  async connectToDevice(
    @Param('systemId') _systemId: string,
    @UploadedFiles() _workspaceFile?: Multer,
    @Body() _connectToDeviceRequestDto?: ConnectToDeviceRequest,
  ): Promise<ApiResult<ProjectDetails>> {
    await Promise.resolve();
    const projectResponse: ApiResult<ProjectDetails> =
      new ApiResult<ProjectDetails>();
    return projectResponse;
  }
}
