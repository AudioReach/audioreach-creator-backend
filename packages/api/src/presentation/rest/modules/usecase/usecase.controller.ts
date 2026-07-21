/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BadRequestException,
  Controller,
  Get,
  NotImplementedException,
  Post,
  Patch,
  //  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import {ApiTags, ApiQuery, ApiExtraModels, ApiParam} from '@nestjs/swagger';
import {SubsystemDto} from '../subsystem/dto/subsystem.dto.js';
import {BaseController} from '../base/base.controller.js';
import {
  UsecaseIdentifierDto,
  UsecaseDto,
  SubsystemFilteredUsecasesDto,
  UsecaseType,
} from './dto/usecase.dto.js';
import {ComponentCollectionDto} from '../../common/dto/component-collection.dto.js';
import {ComponentCollectionWithSubsystemsDto} from '../../common/dto/component-collection-with-subsystems.dto.js';
import {UpdateUsecaseRequestDto} from './dto/request/update-usecase-request.dto.js';
import {UsecaseResponseDto} from './dto/response/usecase-response.dto.js';
import {SpfModuleDto} from '../spf-module/dto/shared/spf-module.dto.js';
import {DataLinkDto} from '../data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../control-link/dto/control-link.dto.js';
import {DataLinkWithUsecasesDto} from './dto/data-link-with-usecases.dto.js';
import {ControlLinkWithUsecasesDto} from './dto/control-link-with-usecases.dto.js';
import {BaseComponentDto, SystemIdsRequestDto} from '../../common/dto/index.js';
import {
  DataPortDto,
  PortIoType,
  PortType,
} from '../../common/dto/data-port.dto.js';
import {
  ControlPortDto,
  ControlPortIntentDto,
} from '../../common/dto/control-port.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {
  QueryBus,
  GetAllUseCasesQuery,
  GetComponentsQuery,
  GetComponentsWithSubsystemsQuery,
  type Result,
  UseCaseReadModel,
  type KeyValuePairReadModel,
  type ComponentsReadModel,
  type ComponentsWithSubsystemsReadModel,
  COMPONENT_SCOPE_TYPE,
  FilterParser,
  validateFilterFields,
} from '@arc/core';
import {
  KeyValuePairsInfo,
  KeyValueInfo,
  KeyInfo,
  ValueInfo,
} from '../../common/dto/kv.dto.js';
import {CONN_CTRL_TYPE} from '../../common/utils/enums.js';

/**
 * Valid filter fields for GET /usecases.
 * Adding a new field: add here + add matching .register() in USECASE_PARAM_FILTER.
 */
const USECASE_ALLOWED_FILTER_FIELDS: ReadonlySet<string> = new Set([
  'spfModuleInstanceId',
  'subgraphId',
  'containerId',
]);

/**
 * Controller to support all usecase related APIs
 */
@ApiTags('usecases')
@Controller('arc-api/v1/projects/:projectId/usecases')
//@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
@ApiExtraModels(
  UsecaseIdentifierDto,
  UsecaseDto,
  SubsystemFilteredUsecasesDto,
  BaseComponentDto,
  SpfModuleDto,
  SubsystemDto,
  ComponentCollectionDto,
  ComponentCollectionWithSubsystemsDto,
)
export class UseCaseController extends BaseController {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  //#region READ

  //#region Get all usecases

  /**
   * Get all usecases
   */
  @Get()
  @ApiQuery({
    name: 'filter',
    required: false,
    type: 'string',
    description:
      'Filter expression to filter usecases. Supports natural query syntax with explicit operators.\n\n' +
      '**Syntax:**\n' +
      '- Single condition: `field:value`\n' +
      '- AND operator: `field1:value1 AND field2:value2`\n' +
      '- OR operator: `field1:value1 OR field1:value2`\n' +
      '- Parentheses for grouping: `field1:value1 AND (field2:value2 OR field2:value3)`\n\n' +
      '**Valid Fields:**\n' +
      '- `spfModuleInstanceId`: SPF Module natural instance ID\n' +
      '- `subgraphId`: Subgraph system ID\n' +
      '- `containerId`: Container system ID\n\n' +
      '**Value Formats:**\n' +
      '- Hexadecimal: `0x7656`\n' +
      '- Decimal: `30294`\n\n' +
      '**Operators:**\n' +
      '- `AND`: Both conditions must be true\n' +
      '- `OR`: At least one condition must be true\n' +
      '- Parentheses `()`: Group conditions for precedence control\n\n' +
      '**Examples:**\n' +
      '- Single condition: `spfModuleInstanceId:0x7656`\n' +
      '- OR operator: `spfModuleInstanceId:0x7656 OR spfModuleInstanceId:0x7657`\n' +
      '- AND operator: `spfModuleInstanceId:0x7656 AND subgraphId:0x8978`\n' +
      '- Complex with parentheses: `spfModuleInstanceId:0x7656 AND (containerId:0x8976 OR containerId:0x9877)`\n' +
      '- Multiple ANDs: `spfModuleInstanceId:0x7656 AND subgraphId:0x8978 AND containerId:0x8976`\n' +
      '- Multiple ORs: `spfModuleInstanceId:0x7656 OR spfModuleInstanceId:0x7657 OR spfModuleInstanceId:0x7658`\n\n' +
      '**Note:** Comma-separated values are NOT supported. Use explicit OR operator instead.',
    example: 'spfModuleInstanceId:0x7656 AND subgraphId:0x8978',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all usecases with optional filtering',
    description:
      'Returns array of usecases with raw GKV (Graph Key-Value) information.\n\n' +
      '**Response Structure:**\n' +
      'Each response item contains:\n' +
      '- `usecases`: Array containing a single UsecaseIdentifierDto with complete raw GKV\n\n' +
      '**For subsystem-filtered usecases:**\n' +
      '- Use the `/usecases/filtered-by-subsystem` endpoint instead\n\n' +
      '**Optional Filtering:**\n' +
      'You can optionally filter usecases using the `filter` query parameter. ' +
      'The filter supports:\n' +
      '- `spfModuleInstanceId`: Filter by SPF module natural instance IDs\n' +
      '- `subgraphId`: Filter by subgraph system IDs\n' +
      '- `containerId`: Filter by container system IDs\n' +
      '- Operators: Use `AND`, `OR`, and parentheses for complex filtering\n\n' +
      'See the filter parameter documentation for detailed examples and usage.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Usecases returned successfully with raw GKV information',
        dto: [UsecaseDto],
        example: {
          className: 'UseCaseIdentifierCollectionExample',
        },
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid filter parameter',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found or no use cases found',
      },
    ],
  })
  async getAllUsecases(
    @Param('projectId') projectId: string,
    @Query('filter') filterExpression?: string,
  ): Promise<ApiResult<UsecaseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    // Parse filter expression — returns warning on invalid syntax, undefined if absent
    const {expression, issue} = FilterParser.tryParse(filterExpression);
    if (issue) {
      throw new BadRequestException(issue.message);
    }

    // Validate field names against allowed set for this endpoint
    if (expression) {
      const unknownField = validateFilterFields(
        expression,
        USECASE_ALLOWED_FILTER_FIELDS,
      );
      if (unknownField) {
        throw new BadRequestException(
          `Unknown filter field: '${unknownField}'`,
        );
      }
    }

    const query = new GetAllUseCasesQuery(
      parsedProjectId,
      'client-id', // TODO: get actual clientId from JWT
      expression,
    );

    const result =
      await this.queryBus.execute<Result<UseCaseReadModel[]>>(query);

    return toApiResult(result, data => this.transformToUsecaseDtos(data));
  }

  //#endregion

  //#region Get subsystem-filtered usecases

  /**
   * Get all usecases filtered by subsystem.
   * This endpoint returns usecases organized by subsystem hierarchy with filtered key-values.
   */
  @Get('filtered-by-subsystem')
  @ApiQuery({
    name: 'filter',
    required: false,
    type: 'string',
    description:
      'Filter expression to filter usecases by subsystem ID. Supports natural query syntax with explicit operators.\n\n' +
      '**Syntax:**\n' +
      '- Single condition: `subsystemId:value`\n' +
      '- AND operator: `subsystemId:value1 AND subsystemId:value2`\n' +
      '- OR operator: `subsystemId:value1 OR subsystemId:value2`\n' +
      '- Parentheses for grouping: `subsystemId:value1 AND (subsystemId:value2 OR subsystemId:value3)`\n\n' +
      '**Valid Fields:**\n' +
      '- `subsystemId`: Subsystem system ID (only field supported by this endpoint)\n\n' +
      '**Value Formats:**\n' +
      '- Hexadecimal: `0x1`\n' +
      '- Decimal: `1`\n\n' +
      '**Operators:**\n' +
      '- `AND`: Both conditions must be true\n' +
      '- `OR`: At least one condition must be true\n' +
      '- Parentheses `()`: Group conditions for precedence control\n\n' +
      '**Examples:**\n' +
      '- Single subsystem: `subsystemId:0x1`\n' +
      '- Multiple subsystems (OR): `subsystemId:0x1 OR subsystemId:0x2`\n' +
      '- Multiple subsystems (AND): `subsystemId:0x1 AND subsystemId:0x2`\n' +
      '- Complex with parentheses: `subsystemId:0x1 AND (subsystemId:0x2 OR subsystemId:0x3)`\n\n' +
      '**Note:** \n' +
      '- Comma-separated values are NOT supported. Use explicit OR operator instead.\n' +
      '- For filtering by spfModuleInstanceId, subgraphId, or containerId, use the `/usecases` endpoint instead.',
    example: 'subsystemId:0x1 OR subsystemId:0x2',
  })
  @ApiDocumentationWithExample({
    summary: 'Get subsystem-filtered usecases',
    description:
      'Returns usecases organized by subsystem hierarchy with filtered key-values.\n\n' +
      'This endpoint provides a hierarchical view where:\n' +
      '- Each response item contains a subsystem-filtered key-value (filteredKV)\n' +
      '- The usecases array contains all raw GKVs that match the filtered GKV\n' +
      '- Usecases are organized by their subsystem relationships\n\n' +
      '**Response Structure:**\n' +
      '- `filteredKV`: The subsystem-filtered key-value information\n' +
      '- `usecases`: Array of UsecaseIdentifierDto with raw GKVs matching the filtered GKV\n\n' +
      '**Optional Filtering:**\n' +
      'You can optionally filter usecases using the `filter` query parameter. ' +
      'See the filter parameter documentation for detailed examples and usage.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subsystem-filtered usecases returned successfully',
        dto: [SubsystemFilteredUsecasesDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid filter parameter',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found or no usecases found',
      },
    ],
  })
  getSubsystemFilteredUsecases(
    @Param('projectId') projectId: string,
    @Query('filter') filterExpression?: string,
  ): Promise<ApiResult<SubsystemFilteredUsecasesDto[]>> {
    console.log('Getting subsystem-filtered usecases for project:', projectId);

    // TODO: Implement filter parsing and validation
    if (filterExpression) {
      console.log(
        'Filter expression provided but not yet implemented:',
        filterExpression,
      );
    }

    // TODO: Implement subsystem filtering logic
    // 1. Query usecases with subsystem hierarchy
    // 2. Group usecases by subsystem-filtered GKV
    // 3. Create SubsystemFilteredUsecasesDto instances
    // 4. Return organized hierarchy

    throw new NotImplementedException(
      'getSubsystemFilteredUsecases is not implemented yet',
    );
  }

  //#endregion

  //#region Get data links for component port

  /**
   * Get all ACDB data links where the given component+port combination is used (as source or destination).
   */
  @Get('data-link')
  @ApiDocumentationWithExample({
    summary: 'Get ACDB data links for a component+port combination',
    description:
      'Returns all ACDB data links in the project where the specified component and port appear ' +
      'on either the source or destination end of the link, along with the usecases each link belongs to.\n\n' +
      '**Link Type:**\n' +
      '- Returns ACDB data links (direct connections)\n' +
      '**Matching criteria:**\n' +
      '- `sourceNodeSystemId == componentSystemId && sourcePortSystemId == portSystemId`, OR\n' +
      '- `destinationNodeSystemId == componentSystemId && destinationPortSystemId == portSystemId`\n\n' +
      '**Response shape per item:**\n' +
      '- `link`: The matched data link\n' +
      '- `usecases`: Array of usecases that this data link is part of',
    responses: [
      {
        status: HttpStatus.OK,
        description:
          'ACDB data links with their usecases returned successfully',
        dto: [DataLinkWithUsecasesDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description:
          'Missing or invalid componentSystemId / portSystemId, or subsystem component provided',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description:
          'Project not found, or no data links found for the given component+port',
      },
    ],
  })
  @ApiQuery({
    name: 'componentSystemId',
    required: true,
    type: 'string',
    description: 'System ID of the component (module/node, NOT subsystem)',
    example: '123',
  })
  @ApiQuery({
    name: 'portSystemId',
    required: true,
    type: 'string',
    description: 'System ID of the port on the component',
    example: '456',
  })
  async getDataLinksForComponentPort(
    @Param('projectId') projectId: string,
    @Query('componentSystemId') componentSystemId: string,
    @Query('portSystemId') portSystemId: string,
  ): Promise<ApiResult<DataLinkWithUsecasesDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting ACDB data links for component+port in project:',
      projectId,
      'componentSystemId:',
      componentSystemId,
      'portSystemId:',
      portSystemId,
    );

    if (!componentSystemId || !portSystemId) {
      throw new BadRequestException(
        'componentSystemId and portSystemId are required',
      );
    }

    const parsedComponentId = Number.parseInt(componentSystemId, 10);
    const parsedPortId = Number.parseInt(portSystemId, 10);

    if (Number.isNaN(parsedComponentId) || Number.isNaN(parsedPortId)) {
      throw new BadRequestException(
        'componentSystemId and portSystemId must be valid numbers',
      );
    }

    // TODO: Validate that the component is NOT a subsystem
    // If it is a subsystem, throw BAD_REQUEST error

    throw new NotImplementedException(
      'getDataLinksForComponentPort is not implemented yet',
    );
  }

  //#endregion

  //#region Get control links for component port

  /**
   * Get all ACDB control links where the given component+port combination is used (as either peer).
   */
  @Get('control-link')
  @ApiDocumentationWithExample({
    summary: 'Get ACDB control links for a component+port combination',
    description:
      'Returns all ACDB control links in the project where the specified component and port appear ' +
      'on either peer end (A or B) of the link, along with the usecases each link belongs to.\n\n' +
      '**Link Type:**\n' +
      '- Returns ACDB control links (direct connections)\n' +
      '**Matching criteria:**\n' +
      '- `peerNodeASystemId == componentSystemId && nodeAPortSystemId == portSystemId`, OR\n' +
      '- `peerNodeBSystemId == componentSystemId && nodeBPortSystemId == portSystemId`\n\n' +
      '**Response shape per item:**\n' +
      '- `link`: The matched control link\n' +
      '- `usecases`: Array of usecases that this control link is part of',
    responses: [
      {
        status: HttpStatus.OK,
        description:
          'ACDB control links with their usecases returned successfully',
        dto: [ControlLinkWithUsecasesDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description:
          'Missing or invalid componentSystemId / portSystemId, or subsystem component provided',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description:
          'Project not found, or no control links found for the given component+port',
      },
    ],
  })
  @ApiQuery({
    name: 'componentSystemId',
    required: true,
    type: 'string',
    description: 'System ID of the component (module/node, NOT subsystem)',
    example: '123',
  })
  @ApiQuery({
    name: 'portSystemId',
    required: true,
    type: 'string',
    description: 'System ID of the port on the component',
    example: '456',
  })
  async getControlLinksForComponentPort(
    @Param('projectId') projectId: string,
    @Query('componentSystemId') componentSystemId: string,
    @Query('portSystemId') portSystemId: string,
  ): Promise<ApiResult<ControlLinkWithUsecasesDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting ACDB control links for component+port in project:',
      projectId,
      'componentSystemId:',
      componentSystemId,
      'portSystemId:',
      portSystemId,
    );

    if (!componentSystemId || !portSystemId) {
      throw new BadRequestException(
        'componentSystemId and portSystemId are required',
      );
    }

    const parsedComponentId = Number.parseInt(componentSystemId, 10);
    const parsedPortId = Number.parseInt(portSystemId, 10);

    if (Number.isNaN(parsedComponentId) || Number.isNaN(parsedPortId)) {
      throw new BadRequestException(
        'componentSystemId and portSystemId must be valid numbers',
      );
    }

    // TODO: Validate that the component is NOT a subsystem
    // If it is a subsystem, throw BAD_REQUEST error

    throw new NotImplementedException(
      'getControlLinksForComponentPort is not implemented yet',
    );
  }

  //#endregion

  //#region Get components in usecases

  /**
   * Query components across multiple usecases (flat structure).
   * For components shared between usecases, only one copy will be returned.
   */
  @Post('components/query')
  @HttpCode(HttpStatus.OK)
  @ApiDocumentationWithExample({
    summary: 'Query components across multiple usecases (flat structure)',
    description:
      '**Read-only query operation** that returns components in flat structure.\n\n' +
      '**Why POST?** Uses POST method to support large lists of usecase IDs that may exceed ' +
      'URL length limits (>2000 characters). This operation does not modify server state and is safe to retry.\n\n' +
      '**Response Structure:**\n' +
      '- Returns flat structure with all modules, data links, and control links\n' +
      '- No subsystem hierarchy included\n' +
      '**For hierarchical structure with subsystems:**\n' +
      '- Use the `/components/query-with-subsystems` endpoint instead\n\n' +
      '**Note:** For components shared across different usecases, only one copy will be returned.',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of system ids for usecases',
    requestDtoExample: {
      className: 'UseCaseIdCollectionExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'All components returned successfully',
        dto: ComponentCollectionDto,
        example: {
          className: 'UsecaseComponentsExample',
        },
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some usecases could not be retrieved (see errors array)',
        dto: ComponentCollectionDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components for usecase(s)',
      },
    ],
  })
  async queryUsecaseComponents(
    @Param('projectId') projectId: string,
    @Body() usecaseSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<ComponentCollectionDto>> {
    if (
      !usecaseSystemIds?.systemIds ||
      usecaseSystemIds.systemIds.length === 0
    ) {
      throw new BadRequestException(
        'systemIds array is required and cannot be empty',
      );
    }

    const systemIds = usecaseSystemIds.systemIds.map(id => {
      const parsed = Number.parseInt(id, 10);
      if (Number.isNaN(parsed)) {
        throw new BadRequestException(`Invalid use case system ID: ${id}`);
      }
      return parsed;
    });

    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const query = new GetComponentsQuery(
      {type: COMPONENT_SCOPE_TYPE.Usecase, systemIds},
      parsedProjectId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<ComponentsReadModel>>(query);

    return toApiResult(result, data =>
      this.transformToComponentCollectionDto(data),
    );
  }

  //#endregion

  //#region Get components with subsystem hierarchy

  /**
   * Query components across multiple usecases with subsystem hierarchy.
   * For components shared between usecases, only one copy will be returned.
   */
  @Post('components/query-with-subsystems')
  @HttpCode(HttpStatus.OK)
  @ApiDocumentationWithExample({
    summary:
      'Query components across multiple usecases (with subsystem hierarchy)',
    description:
      '**Read-only query operation** that returns components organized by subsystem hierarchy.\n\n' +
      '**Why POST?** Uses POST method to support large lists of usecase IDs that may exceed ' +
      'URL length limits (>2000 characters). This operation does not modify server state and is safe to retry.\n\n' +
      '**Response Structure:**\n' +
      '- Components are organized by their subsystem relationships\n' +
      '- The `subsystems` field contains the complete subsystem hierarchy\n' +
      '- Modules, links, and other components are nested within their respective subsystems\n' +
      '- Components are returned directly without wrapper objects\n\n' +
      '**For flat structure without subsystems:**\n' +
      '- Use the `/components/query` endpoint instead\n\n' +
      '**Note:** For components shared across different usecases, only one copy will be returned.',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of system ids for usecases',
    requestDtoExample: {
      className: 'UseCaseIdCollectionExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description:
          'All components with subsystem hierarchy returned successfully',
        dto: ComponentCollectionWithSubsystemsDto,
        example: {
          className: 'UsecaseComponentsExample',
        },
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some usecases could not be retrieved (see errors array)',
        dto: ComponentCollectionWithSubsystemsDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components for usecase(s)',
      },
    ],
  })
  async queryUsecaseComponentsWithSubsystems(
    @Param('projectId') projectId: string,
    @Body() usecaseSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<ComponentCollectionWithSubsystemsDto>> {
    if (
      !usecaseSystemIds?.systemIds ||
      usecaseSystemIds.systemIds.length === 0
    ) {
      throw new BadRequestException(
        'systemIds array is required and cannot be empty',
      );
    }

    const systemIds = usecaseSystemIds.systemIds.map(id => {
      const parsed = Number.parseInt(id, 10);
      if (Number.isNaN(parsed)) {
        throw new BadRequestException(`Invalid use case system ID: ${id}`);
      }
      return parsed;
    });

    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const query = new GetComponentsWithSubsystemsQuery(
      {type: COMPONENT_SCOPE_TYPE.Usecase, systemIds},
      parsedProjectId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<ComponentsWithSubsystemsReadModel>>(
        query,
      );
    return toApiResult(result, data =>
      this.transformToComponentCollectionWithSubsystemsDto(data),
    );
  }

  //#endregion

  //#endregion

  //#region UPDATE

  //#region Update usecase

  /**
   * Update usecase alias information.
   */
  @Patch(':usecaseSystemId')
  @ApiDocumentationWithExample({
    summary: 'Update usecase alias information',
    description:
      'Updates the alias information for a specific usecase. The alias can be set or removed (by passing null).\n\n' +
      '**Request Body:**\n' +
      '- `aliasInfo` (required, nullable): Alias information object or null\n' +
      '  - When provided as an object with `id` and `name`, it updates the alias for the usecase\n' +
      '  - When set to `null`, it removes the existing alias from the usecase\n\n' +
      '**Response:**\n' +
      'Returns the updated usecase with:\n' +
      '- `systemId`: Unique system identifier of the usecase\n' +
      '- `gkv`: Array of Graph Key-Value pairs\n' +
      '- `aliasInfo`: Updated alias information (or null if removed)\n' +
      '- `categories`: Array of category names',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Usecase updated successfully',
        dto: UsecaseResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or usecase not found',
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid request data',
      },
      {
        status: HttpStatus.CONFLICT,
        description: 'Alias ID is already in use by another usecase',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to update usecase',
      },
    ],
  })
  @ApiParam({
    name: 'usecaseSystemId',
    type: 'string',
    description: 'The unique system identifier of the usecase to update',
    example: '123',
  })
  async updateUsecase(
    @Param('projectId') projectId: string,
    @Param('usecaseSystemId') usecaseSystemId: string,
    @Body() updateUsecaseDto: UpdateUsecaseRequestDto,
  ): Promise<ApiResult<UsecaseResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Updating usecase:',
      usecaseSystemId,
      'in project:',
      projectId,
      'with data:',
      updateUsecaseDto,
    );
    throw new NotImplementedException('updateUsecase is not implemented yet');
  }

  //#endregion

  //#endregion

  //#region DELETE

  //#region Delete usecases

  /**
   * Delete usecases for provided usecase ids.
   */
  @Post('delete')
  @ApiDocumentationWithExample({
    summary: 'Delete usecases for provided usecase ids',
    requestDto: SystemIdsRequestDto,
    requestDtoExample: {
      className: 'UseCaseIdCollectionExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'All usecases deleted successfully',
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some usecases could not be deleted (see errors array)',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to delete usecase(s)',
      },
    ],
  })
  async deleteUsecases(
    @Param('projectId') projectId: string,
    @Body() usecaseSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<UsecaseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Deleting usecases for project:',
      projectId,
      'with system IDs:',
      usecaseSystemIds,
    );
    throw new NotImplementedException('deleteUsecases is not implemented yet');
  }

  //#endregion

  //#endregion

  //#region Helper Methods

  /**
   * Transform UseCaseReadModel[] to UsecaseDto[]
   * Converts each usecase to a simple UsecaseDto (extends UsecaseIdentifierDto)
   */
  private transformToUsecaseDtos(usecases: UseCaseReadModel[]): UsecaseDto[] {
    return usecases.map(usecase => {
      // Transform KeyValuePairReadModel[] to KeyValueInfo[]
      const keyValueCollection = this.transformKeyVectors(usecase.gkv);

      // Create KeyValuePairsInfo from the key-value collection
      const kvInfo = new KeyValuePairsInfo(keyValueCollection);
      kvInfo.systemId = usecase.systemId.toString();

      // Create UsecaseDto (which extends UsecaseIdentifier)
      const usecaseDto = new UsecaseDto(
        usecase.systemId.toString(),
        UsecaseType.Regular, // Default type, could be determined from data
        kvInfo,
        usecase.aliasId,
        usecase.alias,
        usecase.categories?.join(','), // Convert array to string if needed
      );

      return usecaseDto;
    });
  }

  /**
   * Transform KeyValuePairReadModel[] to KeyValueInfo[]
   */
  private transformKeyVectors(
    keyVectors: KeyValuePairReadModel[],
  ): KeyValueInfo[] {
    return keyVectors.map(
      kv =>
        new KeyValueInfo(
          new KeyInfo(kv.key.keyId, kv.key.name, `key_${kv.key.keyId}`),
          new ValueInfo(
            kv.value.valueId,
            kv.value.name,
            `val_${kv.value.valueId}`,
          ),
        ),
    );
  }

  /**
   * Transform UseCaseComponentsReadModel to ComponentCollectionDto
   */
  private transformToComponentCollectionDto(
    components: ComponentsReadModel,
  ): ComponentCollectionDto {
    const dto = new ComponentCollectionDto();

    dto.spfModules = components.modules.map(module => {
      const moduleDto = new SpfModuleDto(
        module.systemId.toString(),
        module.instanceId,
        module.definitionSystemId,
        module.name,
      );
      // SpfModuleReadModel has subgraphId + containerId directly (no nested objects)
      moduleDto.subgraphId = module.subgraphId;
      moduleDto.containerId = module.containerId;

      moduleDto.dataPorts = module.dataPorts.map(
        port =>
          new DataPortDto(
            port.systemId.toString(),
            port.portId,
            port.name ?? '',
            port.portIoType === 'Input' ? PortIoType.Input : PortIoType.Output,
            port.isStatic ? PortType.Static : PortType.Dynamic,
          ),
      );

      moduleDto.controlPorts = module.controlPorts.map(port => {
        const intents = port.allocatedIntents.map(
          intent => new ControlPortIntentDto(intent.intentId, intent.name),
        );
        return new ControlPortDto(
          port.systemId.toString(),
          port.portId,
          port.name ?? '',
          port.isStatic ? PortType.Static : PortType.Dynamic,
          intents,
        );
      });

      return moduleDto;
    });

    dto.dataLinks = components.dataLinks.map(
      link =>
        new DataLinkDto(
          link.systemId.toString(),
          link.systemId,
          CONN_CTRL_TYPE.MODULE_MODULE,
          link.sourceNodeSystemId,
          link.sourcePortSystemId,
          link.destinationNodeSystemId,
          link.destinationPortSystemId,
          false,
        ),
    );

    dto.controlLinks = components.controlLinks.map(
      link =>
        new ControlLinkDto(
          link.systemId.toString(),
          link.systemId,
          CONN_CTRL_TYPE.MODULE_MODULE,
          link.peerNodeASystemId,
          link.nodeAPortSystemId,
          link.peerNodeBSystemId,
          link.nodeBPortSystemId,
          false,
          undefined,
        ),
    );

    return dto;
  }

  private transformToComponentCollectionWithSubsystemsDto(
    tree: ComponentsWithSubsystemsReadModel,
  ): ComponentCollectionWithSubsystemsDto {
    const dto = new ComponentCollectionWithSubsystemsDto();
    // Reuse flat mapper for modules + links at this level
    const flat = this.transformToComponentCollectionDto(tree);
    dto.spfModules = flat.spfModules;
    dto.dataLinks = flat.dataLinks;
    dto.controlLinks = flat.controlLinks;

    // Map each subsystem recursively — same shape as root
    dto.subsystems = tree.subsystems.map(sub => {
      const subDto = new SubsystemDto(
        String(sub.systemId),
        sub.systemId, // id — use systemId as the numeric id
        sub.name,
      );
      subDto.filteredKeys = sub.filteredKeys.map(
        k => new KeyInfo(k.keyId, k.name, String(k.systemId)),
      );
      // children has the same ComponentsWithSubsystemsReadModel shape — recurse
      subDto.children = this.transformToComponentCollectionWithSubsystemsDto(
        sub.children,
      );
      return subDto;
    });

    return dto;
  }

  //#endregion
}
