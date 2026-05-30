/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Request,
  UploadedFiles,
  //UseGuards,
  UseInterceptors,
  Inject,
  Res,
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

import {memoryStorage} from 'multer';
import {
  CommandBus,
  QueryBus,
  UploadFileCommand,
  DownloadFileQuery,
  ProjectFilePropertiesQuery,
} from '@arc/core';
import type {
  PathRef,
  Logger,
  DownloadFileResult,
  ProjectFilePropertiesResult,
  UploadFileResult,
} from '@arc/core';
import {promises as fsPromises} from 'node:fs';

interface AuthenticatedRequest extends Request {
  user?: {
    clientId?: string;
    [key: string]: unknown;
  };
}
import * as os from 'node:os';
import path from 'node:path';
import type {Response} from 'express';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {ProjectInfoResponseDto} from './dto/project-info-response.dto.js';
import {ProjectInfoUpdateDto} from './dto/project-info-update.dto.js';
import {ProjectFilePropertiesResponseDto} from './dto/project-file-properties.dto.js';
import {ProjectType} from './enums/project-type.enum.js';
import {SessionMode} from './enums/session-mode.enum.js';
import {MultipartResponseHelper} from '../../../../infrastructure-wrapper/helpers/multipart-response.helper.js';

@Controller('arc-api/v1/projects')
//@UseGuards(AuthGuard('jwt'))
export class ProjectController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    @Inject('LOGGER') private readonly logger: Logger,
  ) {}

  /**
   * Creates a safe temporary file path by sanitizing the filename
   * and ensuring it's within the OS temp directory
   */
  private createSafeTempPath(filename: string): string {
    // Remove any path components to prevent directory traversal
    const sanitizedFilename = path.basename(filename);
    const tmpDir = os.tmpdir();
    // Use resolve to normalize the path and prevent traversal
    return path.resolve(tmpDir, `${Date.now()}-${sanitizedFilename}`);
  }

  /**
   * Safely writes a file to a validated temp path
   */
  private async safeWriteFile(
    validatedPath: string,
    data: Buffer,
  ): Promise<void> {
    // Validate path is within temp directory
    const tmpDir = os.tmpdir();
    const normalizedPath = path.normalize(validatedPath);
    const normalizedTmpDir = path.normalize(tmpDir);

    if (!normalizedPath.startsWith(normalizedTmpDir)) {
      throw new BadRequestException(
        'Invalid file path: must be within temp directory',
      );
    }

    await fsPromises.writeFile(validatedPath, data);
  }

  /**
   * Safely deletes a file at a validated temp path
   */
  private async safeUnlink(validatedPath: string): Promise<void> {
    // Validate path is within temp directory
    const tmpDir = os.tmpdir();
    const normalizedPath = path.normalize(validatedPath);
    const normalizedTmpDir = path.normalize(tmpDir);

    if (!normalizedPath.startsWith(normalizedTmpDir)) {
      throw new BadRequestException(
        'Invalid file path: must be within temp directory',
      );
    }

    await fsPromises.unlink(validatedPath);
  }

  @Post('/offline/upload-files')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Create project by uploading ACDB and workspace files',
    description: 'Creates a new project by uploading ACDB and workspace files',
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
        // eslint-disable-next-line sonarjs/content-length
        storage: memoryStorage(),
        limits: {
          fileSize: 7_500_000, // 7.5MB = 7,500,000 bytes (safely under SonarJS 8MB limit)
        },
      },
    ),
  )
  async createProjectFromFiles(
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
    const clientId = '';
    //TODO: gather from jwt
    //TODO: client id null throw exception

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

    const acdbPath = this.createSafeTempPath(acdb.originalname);
    const awspPath = this.createSafeTempPath(awsp.originalname);

    // Write Multer buffers to temp files
    await this.safeWriteFile(acdbPath, acdb.buffer);
    await this.safeWriteFile(awspPath, awsp.buffer);

    const acdbRef: PathRef = {
      kind: 'path',
      name: acdb.originalname,
      mimeType: acdb.mimetype,
      uri: acdbPath,
    };
    const awspRef: PathRef = {
      kind: 'path',
      name: awsp.originalname,
      mimeType: awsp.mimetype,
      uri: awspPath,
    };

    // Dispatch command
    const result = await this.commandBus.execute<UploadFileResult>(
      new UploadFileCommand(clientId, acdbRef, awspRef),
    );

    // Cleanup temp files after successful processing
    await Promise.allSettled([
      this.safeUnlink(acdbPath),
      this.safeUnlink(awspPath),
    ]);

    const projectdetails: ProjectInfoResponseDto = {
      projectId: result.projectId,
      name: result.projectName,
      description: result.projectDescription,
      projectType: ProjectType.Offline,
      sessionMode: SessionMode.Designer,
    };

    const hasErrors = result.errors && result.errors.length > 0;

    const projectResponse: ApiResult<ProjectInfoResponseDto> = {
      data: projectdetails,
      success: !hasErrors,
      message: hasErrors
        ? `Project created with ${result.errors?.length} validation errors. Please review and fix the issues.`
        : 'The file has been opened successfully',
      errors: result.errors,
      warnings: result.warnings,
    };
    return projectResponse;
  }

  @Get()
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
    @Request() req: AuthenticatedRequest,
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

  @Get('/:projectId')
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

  @Patch('/:projectId')
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

  @Post('/:projectId/connect')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Connect to existing project',
    description: 'Establish connection to an existing project for active use.',
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

  @Post('/:projectId/disconnect')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Disconnect from project',
    description:
      'Disconnect from project while keeping it available for future connections.',
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

  /**
   * Downloads ACDB and workspace files for a project as multipart/form-data.
   *
   * This endpoint returns both files in a single response using the multipart/form-data format,
   * which mirrors the format used by the upload endpoint. This ensures symmetry in the API design.
   *
   * **Response Format:**
   * - Content-Type: `multipart/form-data; boundary=<generated-boundary>`
   * - Body: RFC 2046 compliant multipart response containing two parts:
   *   1. `acdbFile`: Binary ACDB calibration database file
   *   2. `workspaceFile`: Binary workspace configuration file
   *
   * **Parsing the Response:**
   *
   * Most HTTP clients have built-in multipart parsing support:
   *
   * - **JavaScript (Browser):**
   *   ```javascript
   *   const formData = await response.formData();
   *   const acdbFile = formData.get('acdbFile');
   *   const workspaceFile = formData.get('workspaceFile');
   *   ```
   *
   * - **Node.js (with busboy):**
   *   ```javascript
   *   const busboy = require('busboy');
   *   const bb = busboy({ headers: response.headers });
   *   bb.on('file', (name, file, info) => {
   *     // name will be 'acdbFile' or 'workspaceFile'
   *   });
   *   response.pipe(bb);
   *   ```
   *
   * **Why Multipart Format?**
   * - Mirrors the upload endpoint format (symmetry)
   * - Standard HTTP format (RFC 2046)
   * - Efficient binary transfer (no base64 encoding overhead)
   * - Widely supported by HTTP clients
   *
   * @param projectId - The ID of the project to download files for
   * @param res - Express response object (injected by NestJS)
   * @returns void - Response is sent directly via the res object
   *
   * @throws {NotFoundException} If the project does not exist
   * @throws {InternalServerErrorException} If file generation fails
   */
  @Get('/:projectId/download-files')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Download the ACDB and workspace files as multipart/form-data',
    description:
      'Downloads both ACDB and workspace files in a single multipart response. ' +
      'The response format mirrors the upload endpoint for API symmetry. ' +
      'See documentation for parsing examples in various languages.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description:
      'Files downloaded successfully as multipart/form-data. ' +
      'Parse the response using standard HTTP client multipart parsers.',
    content: {
      'multipart/form-data': {
        schema: {
          type: 'object',
          properties: {
            acdbFile: {
              type: 'string',
              format: 'binary',
              description: 'ACDB calibration database file (binary)',
            },
            workspaceFile: {
              type: 'string',
              format: 'binary',
              description: 'Workspace configuration file (binary)',
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project does not exist',
  })
  async downloadArcDbFiles(
    @Param('projectId') projectId: string,
    @Res() res: Response,
  ): Promise<void> {
    const clientId = '';
    // TODO: gather from jwt

    this.logger.logInfo({
      component: 'ProjectController',
      action: 'downloadArcDbFiles',
      msg: 'Downloading files as multipart response',
      projectId,
      timestamp: new Date(),
      tag: 'file-download',
    });

    const result = await this.queryBus.execute<DownloadFileResult>(
      new DownloadFileQuery(Number(projectId), clientId),
    );

    // Send multipart response using helper
    MultipartResponseHelper.sendMultipartResponse(res, [
      {
        name: 'acdbFile',
        filename: result.acdbFile.name,
        content: result.acdbFile.content,
        contentType: result.acdbFile.fileType,
      },
      {
        name: 'workspaceFile',
        filename: result.workspaceFile.name,
        content: result.workspaceFile.content,
        contentType: result.workspaceFile.fileType,
      },
    ]);

    this.logger.logInfo({
      component: 'ProjectController',
      action: 'downloadArcDbFiles',
      msg: 'Multipart response sent successfully',
      projectId,
      timestamp: new Date(),
      tag: 'file-download',
    });
  }

  @Get('/:projectId/file-properties')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Get ACDB project file properties',
    description:
      'Retrieves file properties including ACDB version, codec information, and OEM details',
  })
  @ApiExtraModels(ApiResult, ProjectFilePropertiesResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Project file properties retrieved successfully',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(ProjectFilePropertiesResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or file properties not found',
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
  async getFileProperties(
    @Param('projectId') projectId: string,
  ): Promise<ApiResult<ProjectFilePropertiesResponseDto>> {
    const clientId = '';
    // TODO: gather from jwt

    const result = await this.queryBus.execute<ProjectFilePropertiesResult>(
      new ProjectFilePropertiesQuery(projectId, clientId),
    );

    return {
      data: result,
      success: true,
      message: 'Project file properties retrieved successfully',
    };
  }

  @Delete('/:projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete project',
    description: 'Delete the project based on project Id.',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiResponse({
    description: 'Successfully deleted project',
    status: HttpStatus.NO_CONTENT,
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
  async deleteProject(@Param('projectId') _projectId: string): Promise<void> {
    // Need a project Id to delete the project. It will take from header. Delete the project and clear the database for that Project Id
    await Promise.resolve();
  }
}
