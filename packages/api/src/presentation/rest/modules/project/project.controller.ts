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
  NotImplementedException,
  Param,
  Patch,
  Post,
  Request,
  UploadedFiles,
  UseGuards,
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
  Result,
  StartSessionCommand,
  EndSessionCommand,
} from '@arc/core';
import type {
  PathRef,
  Logger,
  DownloadFileResult,
  ProjectFilePropertiesResult,
  UploadFileResult,
  SessionResult,
  ActiveSession,
  SessionMode as CoreSessionMode,
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
import {toApiResult} from '../../common/result/to-api-result.js';
import {ProjectInfoResponseDto} from './dto/project-info-response.dto.js';
import {ProjectInfoUpdateDto} from './dto/project-info-update.dto.js';
import {ProjectFilePropertiesResponseDto} from './dto/project-file-properties.dto.js';
import {
  StageChangesRequestDto,
  StageChangesResponseDto,
  UnstageChangesRequestDto,
  UnstageChangesResponseDto,
  CommitChangesRequestDto,
  CommitChangesResponseDto,
  DiscardChangesRequestDto,
  DiscardChangesResponseDto,
} from './dto/changeset.dto.js';
import {StartSessionRequestDto, SessionResponseDto} from './dto/session.dto.js';
import {
  CreateUsecasesResponseDto,
  UsecaseIdentifierWithChangeInfoDto,
} from './dto/create-usecases-response.dto.js';
import {CreateUsecasesRequestDto} from './dto/create-usecases-request.dto.js';
import {ProjectType} from './enums/project-type.enum.js';
import {SessionMode} from './enums/session-mode.enum.js';
import {MultipartResponseHelper} from '../../../../infrastructure-wrapper/helpers/multipart-response.helper.js';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';

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
      new UploadFileCommand(acdbRef, awspRef),
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

    return toApiResult(
      result.issues?.length
        ? Result.partial(projectdetails, result.issues)
        : Result.ok(projectdetails),
    );
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
    console.log('Getting projects for client:', clientId);
    await Promise.resolve();
    throw new NotImplementedException('getProjects is not implemented yet');
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
    await Promise.resolve();
    throw new NotImplementedException('getProject is not implemented yet');
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
    await Promise.resolve();
    throw new NotImplementedException(
      'updateProjectInfo is not implemented yet',
    );
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
    await Promise.resolve();
    throw new NotImplementedException(
      'connectToProject is not implemented yet',
    );
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
    await Promise.resolve();
    throw new NotImplementedException(
      'disconnectFromProject is not implemented yet',
    );
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

    return toApiResult(Result.ok(result));
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
    await Promise.resolve();
    throw new NotImplementedException('deleteProject is not implemented yet');
  }

  //TODO: Add this API when diff-merge is needed
  /*@Get('/:projectId/preview-changes')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'Preview all ACDB data changes',
    description:
      'Returns a comprehensive summary of all ACDB data changes including:\n' +
      '- Usecases: added, updated, and deleted usecases with unique changes\n' +
      '- Definitions: keys, SPF modules, driver modules, SPF properties, and driver properties\n' +
      '- Module Manager: custom module changes (AMDB)\n' +
      '- Driver Module Data: driver module calibration data changes\n' +
      '- Metadata: usecase categories and aliases\n\n' +
      'This API:\n' +
      '- Validates all staged changes in the database\n' +
      '- Returns a summary of what would be changed\n' +
      '- Does NOT modify the database\n' +
      '- Does NOT perform routing, importing, or merging\n\n' +
      'To actually reconcile staged changes and generate usecases, use the POST /create-usecases endpoint.',
  })
  @ApiExtraModels(
    ApiResult,
    PreviewChangesResponseDto,
    UsecaseActionsResponseDto,
    DefinitionActionsResponseDto,
    ModuleManagerActionsResponseDto,
    DriverModuleDataActionsResponseDto,
    MetaDataActionsResponseDto,
  )
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully retrieved changes preview',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(PreviewChangesResponseDto)},
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
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Failed to get changes preview',
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
  previewChanges(
    @Param('projectId') _projectId: string,
  ): ApiResult<PreviewChangesResponseDto> {
    const mockResponse: PreviewChangesResponseDto = {
      usecaseData: {
        added: [],
        updated: [],
        deleted: [],
        uniqueChanges: [],
      },
      definitions: {
        keys: {added: [], updated: [], deleted: []},
        spfModules: {added: [], updated: [], deleted: []},
        driverModules: {added: [], updated: [], deleted: []},
        spfProperties: {added: [], updated: [], deleted: []},
        driverProperties: {added: [], updated: [], deleted: []},
      },
      moduleManager: {added: [], updated: [], deleted: []},
      driverModuleData: {added: [], updated: [], deleted: []},
      metadata: {
        usecaseCategories: {added: [], updated: [], deleted: []},
        usecaseAliases: {added: [], updated: [], deleted: []},
      },
    };

    return {
      data: mockResponse,
      success: true,
      message: 'Successfully retrieved changes preview',
    };
  }*/

  @Post('/:projectId/create-usecases')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: CreateUsecasesRequestDto})
  @ApiOperation({
    summary: 'Reconcile staged changes with database',
    description:
      'Reconciles staged changes with the database using routing logic.\n\n' +
      'This endpoint processes all staged changes and reconciles them into the database state:\n' +
      '- Analyzes staged modules, links, properties, and metadata\n' +
      '- Uses routing logic to discover signal paths\n' +
      '- Generates usecases that represent the discovered paths\n' +
      '- Creates/updates/deletes usecases to match the reconciled state\n' +
      '- Persists all changes to the database\n\n' +
      'The reconciliation process ensures the database state accurately reflects the staged modifications.\n\n' +
      'This operation is idempotent - multiple invocations produce the same result.\n' +
      'If no staged changes exist, returns empty arrays with success: true.\n\n' +
      'Note: warnings and errors arrays are placeholders and will be populated when the validation framework is introduced.',
  })
  @ApiExtraModels(
    ApiResult,
    CreateUsecasesResponseDto,
    UsecaseIdentifierWithChangeInfoDto,
  )
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully reconciled staged changes',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(CreateUsecasesResponseDto)},
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
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Failed to reconcile staged changes',
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
  createUsecases(
    @Param('projectId') _projectId: string,
    @Body() _body: CreateUsecasesRequestDto,
  ): ApiResult<CreateUsecasesResponseDto> {
    throw new NotImplementedException('createUsecases is not implemented yet');
  }

  @Post('/:projectId/stage-changes')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: StageChangesRequestDto})
  @ApiOperation({
    summary: 'Stage changes',
    description: 'Stage changes in the project based on project Id.',
  })
  @ApiExtraModels(ApiResult, StageChangesResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully staged changes',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(StageChangesResponseDto)},
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
  stageChanges(
    @Param('projectId') _projectId: string,
    @Body() _stageChangesRequest: StageChangesRequestDto,
  ): ApiResult<StageChangesResponseDto> {
    throw new NotImplementedException('stageChanges is not implemented yet');
  }

  @Post('/:projectId/unstage-changes')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: UnstageChangesRequestDto})
  @ApiOperation({
    summary: 'Unstage changes',
    description: 'Unstage changes in the project based on project Id.',
  })
  @ApiExtraModels(ApiResult, UnstageChangesResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully unstaged changes',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(UnstageChangesResponseDto)},
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
  unstageChanges(
    @Param('projectId') _projectId: string,
    @Body() _unstageChangesRequest: UnstageChangesRequestDto,
  ): ApiResult<UnstageChangesResponseDto> {
    throw new NotImplementedException('unstageChanges is not implemented yet');
  }

  @Post('/:projectId/commit-changes')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: CommitChangesRequestDto})
  @ApiOperation({
    summary: 'Commit changes',
    description:
      'Commit staged changes in the project based on project Id.\n\n' +
      'Available in all session modes (TUNING, DESIGNER, DISCOVERY_WIZARD, DIFF_MERGE).\n\n' +
      'Behavior:\n' +
      '- If changeIds is not provided or empty, all staged changes will be committed\n' +
      '- If changeIds is provided, only the specified changes will be committed\n' +
      '- All dependencies of the specified changes must be staged, otherwise the commit will fail\n' +
      '- The operation validates that all required dependencies are present before committing\n' +
      '- Pass ?enforceValidation=true to run COMMIT-group validation rules before applying changes; validation failures return 422',
  })
  @ApiExtraModels(ApiResult, CommitChangesResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully committed changes',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(CommitChangesResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or missing dependencies',
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
  async commitChanges(
    @Param('projectId') _projectId: string,
    @Body() _commitChangesRequest: CommitChangesRequestDto,
  ): Promise<ApiResult<CommitChangesResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException('commitChanges is not implemented yet');
  }

  @Post('/:projectId/discard-changes')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: DiscardChangesRequestDto})
  @ApiOperation({
    summary: 'Discard changes',
    description:
      'Discard uncommitted changes in the project based on project Id.\n\n' +
      'Behavior:\n' +
      '- If changeIds is not provided or empty, all changes will be discarded\n' +
      '- If changeIds is provided, only the specified changes will be discarded\n' +
      '- Dependent changes will be automatically discarded as well (cascade delete)\n' +
      '- WARNING: Discarded changes cannot be recovered',
  })
  @ApiExtraModels(ApiResult, DiscardChangesResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully discarded changes',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(DiscardChangesResponseDto)},
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
  async discardChanges(
    @Param('projectId') _projectId: string,
    @Body() _discardChangesRequest: DiscardChangesRequestDto,
  ): Promise<ApiResult<DiscardChangesResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException('discardChanges is not implemented yet');
  }

  @Post('/:projectId/start-session')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiBody({type: StartSessionRequestDto})
  @ApiOperation({
    summary: 'Start a new session',
    description:
      'Start a new session with specified mode. Returns error if a session is already active.\n\n' +
      '## Session Modes & Supported Operations\n\n' +
      '### READONLY (default — not a startable mode)\n' +
      '- Implicit state when no active session exists\n' +
      '- Every project begins in READONLY; it returns to READONLY after end-session\n' +
      '- Read APIs work without any session; start-session is not needed or allowed for READONLY\n\n' +
      '### TUNING\n' +
      '- Read APIs\n' +
      '- Tuning/Calibration APIs (get-cal-data, set-cal-data, goto-change)\n' +
      '- Change Management APIs\n\n' +
      '### DESIGNER\n' +
      '- Read APIs\n' +
      '- Tuning APIs\n' +
      '- Designer APIs (add-module, add-data-link, etc.)\n' +
      '- Change Management APIs\n\n' +
      '### DISCOVERY_WIZARD\n' +
      '- Read APIs\n' +
      '- Import/Discovery APIs (import-h2xml)\n' +
      '- Change Management APIs\n\n' +
      '### DIFF_MERGE\n' +
      '- Read APIs\n' +
      '- Tuning APIs\n' +
      '- Designer APIs\n' +
      '- Diff/Merge APIs (diff-files, merge-changes)\n' +
      '- Change Management APIs\n\n' +
      '**Important**: If an invalid API is called during a session, it will return `403 Forbidden` with error code `INVALID_OPERATION_FOR_MODE`.\n\n',
  })
  @ApiExtraModels(ApiResult, SessionResponseDto, StartSessionRequestDto)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session started successfully',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SessionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input or session already active',
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
  async startSession(
    @Param('projectId') projectId: string,
    @Body() dto: StartSessionRequestDto,
  ): Promise<ApiResult<SessionResponseDto>> {
    const result = await this.commandBus.execute<Result<SessionResult>>(
      new StartSessionCommand(projectId, dto.mode as CoreSessionMode),
    );
    return toApiResult(result, s => ({
      projectId: s.projectId,
      sessionMode: s.sessionMode as unknown as SessionMode,
      summary: s.summary,
    }));
  }

  @Post('/:projectId/end-session')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiOperation({
    summary: 'End the current session',
    description:
      'End the current active session. This operation will:\n' +
      '1. Verify no staged changes remain (returns 422 STAGED_CHANGES_EXIST if any exist — commit or discard them first)\n' +
      '2. Discard all unstaged changes\n' +
      '3. Return project to READONLY (the default no-session state — the active session is ended or deleted)\n' +
      '4. Return a summary of discarded changes\n\n' +
      'If any error occurs during this operation, the session will remain active.',
  })
  @ApiExtraModels(ApiResult, SessionResponseDto)
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Session ended successfully with change summary',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SessionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'Staged changes exist — commit or discard them before ending the session',
    schema: {
      example: {
        statusCode: 422,
        errorCode: 'STAGED_CHANGES_EXIST',
        message:
          'Cannot end session: 3 staged change(s) must be committed or discarded first.',
        details: {stagedCount: 3},
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'No active session',
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
  async endSession(
    @Param('projectId') _projectId: string,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<SessionResponseDto>> {
    const result = await this.commandBus.execute<Result<SessionResult>>(
      new EndSessionCommand(session.projectId),
      session,
    );
    return toApiResult(result, s => ({
      projectId: s.projectId,
      sessionMode: s.sessionMode as unknown as SessionMode,
      summary: s.summary,
    }));
  }
}
