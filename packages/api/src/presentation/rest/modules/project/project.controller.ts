import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UploadedFiles,
  //UseGuards,
  UseInterceptors,
  BadRequestException,
  Inject,
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

import {FileFieldsInterceptor} from '@nestjs/platform-express';

import multer from 'multer';
//import {AuthGuard} from '@nestjs/passport';
import {CommandBus, OpenFileCommand} from '@arc/core';
import type {FileRef, Logger} from '@arc/core';
import {promises as fsPromises} from 'fs';
import * as os from 'os';
import * as path from 'path';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {ProjectInfoResponseDto} from './dto/project-info-response.dto.js';
import {ProjectInfoUpdateDto} from './dto/project-info-update.dto.js';
import {DownloadArcDatabaseFilesResponseDto} from './dto/download-arc-database-files-response.dto.js';
import {ProjectType} from './enums/project-type.enum.js';
import {SessionMode} from './enums/session-mode.enum.js';

@Controller('arc-api/v1/')
//@UseGuards(AuthGuard('jwt'))
export class ProjectController {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject('LOGGER') private readonly logger: Logger,
  ) {}

  @Post('/offline/files')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Open acdb and workspace files',
    description:
      'Creating a new project while opening acdb and workspace files',
  })
  @ApiExtraModels(ApiResult, ProjectInfoResponseDto)
  @ApiResponse({
    description: 'File opened successfully',
    status: HttpStatus.CREATED,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectInfoResponseDto)},
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
      acdbFile: Express.Multer.File[];
      workspaceFile: Express.Multer.File[];
    },
    @Body() _updateProjectInfoRequest: ProjectInfoUpdateDto,
    //@Request() req: any,
  ): Promise<ApiResult<ProjectInfoResponseDto>> {
    this.logger.logInfo({
      component: 'ProjectController',
      action: 'uploadArcDbFiles',
      msg: 'Method called',
      timestamp: new Date(),
      tag: 'file-upload',
    });
    const clientId = ''; //TODO: gather from jwt
    //TODO: enable this later
    /*if (!clientId) {
      throw new BadRequestException('clientId is required');
    }*/

    const acdb = files?.acdbFile?.[0];
    const awsp = files?.workspaceFile?.[0];

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
      this.logger.logError({
        component: 'ProjectController',
        action: 'uploadArcDbFiles',
        msg: 'Failed to write temporary files',
        timestamp: new Date(),
        clientId,
        tag: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      });

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

      const projectdetails: ProjectInfoResponseDto = {
        projectId: result?.projectId ?? '',
        name: result?.projectName ?? '',
        description: result?.projectDescription ?? '',
        projectType: ProjectType.Offline,
        sessionMode: SessionMode.Designer,
      };

      const projectResponse: ApiResult<ProjectInfoResponseDto> = {
        data: projectdetails,
        success: true,
        message: 'The file has been opened successfully',
      };
      return projectResponse;
    } catch (error) {
      // Keep temp files for debugging; log absolute paths
      this.logger.logError({
        component: 'ProjectController',
        action: 'uploadArcDbFiles',
        msg: `Open offline files failed. Temp files preserved: ${acdbPath}, ${awspPath}`,
        timestamp: new Date(),
        clientId,
        tag: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  @Get('projects')
  @ApiOperation({
    summary: 'Get all active projects',
    description: 'Provides the list of all active projects',
  })
  @ApiExtraModels(ApiResult, ProjectInfoResponseDto)
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
              items: {$ref: getSchemaPath(ProjectInfoResponseDto)},
            },
          },
        },
      ],
    },
  })
  async getProjects(
    @Request() req: any,
  ): Promise<ApiResult<ProjectInfoResponseDto[]>> {
    // Extract client ID from JWT token
    const clientId = req.user?.clientId;

    // return list of active projects for this client
    const projectdetails: ProjectInfoResponseDto[] = [];
    await Promise.resolve();
    const projectResponses: ApiResult<ProjectInfoResponseDto[]> = {
      data: projectdetails,
      success: true,
      message: `Successfully fetch projects for client ${clientId}`,
    };
    return projectResponses;
  }

  @Get('projects/:projectId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Get project information',
    description: 'Get project information based on project Id.',
  })
  @ApiExtraModels(ApiResult, ProjectInfoResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectInfoResponseDto)},
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
  ): Promise<ApiResult<ProjectInfoResponseDto>> {
    const projectdetail: ProjectInfoResponseDto = new ProjectInfoResponseDto(); // ToDo Need to update the project Info once services ready
    await Promise.resolve();
    const projectResponse: ApiResult<ProjectInfoResponseDto> = {
      data: projectdetail,
      success: true,
      message: 'Successfully fetch project',
    };
    return projectResponse;
  }

  @Patch('projects/:projectId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: ProjectInfoUpdateDto})
  @ApiOperation({
    summary: 'Update project name and description',
    description: 'Update project name and description based on project Id.',
  })
  @ApiExtraModels(ApiResult, ProjectInfoResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectInfoResponseDto)},
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
    @Body() _updateProjectInfoRequest: ProjectInfoUpdateDto,
  ): Promise<ApiResult<ProjectInfoResponseDto>> {
    const projectdetail: ProjectInfoResponseDto = new ProjectInfoResponseDto(); // ToDo Need to update the project Info once services ready
    await Promise.resolve();
    const projectResponse: ApiResult<ProjectInfoResponseDto> = {
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
  @ApiExtraModels(ApiResult, ProjectInfoResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectInfoResponseDto)},
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
  ): Promise<ApiResult<ProjectInfoResponseDto>> {
    // Need a project Id to open the project. It will take from header

    await Promise.resolve();
    return new ApiResult<ProjectInfoResponseDto>();
  }

  @Patch('projects/:projectId/disconnect-from-project')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Disconnect from the project',
    description: 'Disconnect from specific project based on project Id.',
  })
  @ApiExtraModels(ApiResult, ProjectInfoResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectInfoResponseDto)},
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
  ): Promise<ApiResult<ProjectInfoResponseDto>> {
    // Need a project Id to open the project. It will take from header

    await Promise.resolve();

    return new ApiResult<ProjectInfoResponseDto>();
  }

  @Get('projects/:projectId/download')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Download the acdb and workspace files',
    description:
      'Download the acdb and workspace files based on project Id.\r\n\r\n Project Id should be the part of header of the request.',
  })
  @ApiExtraModels(ApiResult, DownloadArcDatabaseFilesResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(DownloadArcDatabaseFilesResponseDto)},
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
  ): Promise<ApiResult<DownloadArcDatabaseFilesResponseDto>> {
    await Promise.resolve();
    const acdbWorkspaceFilesResponse: DownloadArcDatabaseFilesResponseDto =
      new DownloadArcDatabaseFilesResponseDto();
    const acdbWorkspaceFilesResult: ApiResult<DownloadArcDatabaseFilesResponseDto> =
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
}
