/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  Post,
  Get,
  BadRequestException,
  Body,
  Param,
  HttpStatus,
  UseInterceptors,
  UnprocessableEntityException,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiExtraModels} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {SubgraphDto, SubgraphPropertiesDto} from './dto/subgraph.dto.js';
import {SubgraphPairDto} from './dto/subgraph-pair.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ComponentCollectionDto} from '../../common/dto/component-collection.dto.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {UsecaseIdentifierDto} from '../usecase/dto/usecase.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {SpfModuleDto} from '../spf-module/dto/shared/spf-module.dto.js';
import {DataLinkDto} from '../data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../control-link/dto/control-link.dto.js';
import {
  DataPortDto,
  PortIoType,
  PortType,
} from '../../common/dto/data-port.dto.js';
import {
  ControlPortDto,
  ControlPortIntentDto,
} from '../../common/dto/control-port.dto.js';
import {CONN_CTRL_TYPE} from '../../common/utils/enums.js';
import {
  KeyInfo,
  KeyValueInfo,
  KeyValuePairsInfo,
  ValueInfo,
} from '../../common/dto/kv.dto.js';
import {SharedType} from '../../common/utils/index.js';
import {
  QueryBus,
  GetComponentsQuery,
  GetSubgraphPropertiesQuery,
  GetAllSubgraphsQuery,
  SubgraphsQuery,
  type Result,
  type ComponentsReadModel,
  type PropertyDataDto,
  type SubgraphReadModel,
  type KeyValuePairListReadModel,
  COMPONENT_SCOPE_TYPE,
  RESULT_KIND,
} from '@arc/core';
import {mapPropertyToDto} from '../../common/utils/element-data-mapper.js';
/**
 * Controller to support all subgraph related APIs for usecase design.
 * Provides subgraph related APIs for usecase design.
 */
@ApiTags('subgraphs')
@Controller('arc-api/v1/projects/:projectId/subgraphs')
//@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(
  ConfigElementDto,
  ElementTemplateArrayDto,
  StructDto,
  ComponentCollectionDto,
)
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class SubgraphController extends BaseController {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  /**
   * Get all subgraphs in the project.
   */
  @Get()
  @ApiDocumentationWithExample({
    summary: 'Get all subgraphs in the project',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [SubgraphDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraphs',
      },
    ],
  })
  async getAllSubgraphs(
    @Param('projectId') projectId: string,
  ): Promise<ApiResult<SubgraphDto[]>> {
    const query = new GetAllSubgraphsQuery(
      Number.parseInt(projectId, 10), // radix 10 guards against octal misparse
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<Result<SubgraphReadModel[]>>(query);

    if (result.kind === RESULT_KIND.Fail) {
      throw new UnprocessableEntityException(
        result.issues?.[0]?.message ?? 'Failed to retrieve subgraphs',
      );
    }

    return {
      data: result.data.map(s => this.mapToSubgraphDto(s)),
    };
  }

  /**
   * Query subgraphs for subgraph system ids.
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query subgraphs for subgraph systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of subgraph system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'All subgraphs found successfully',
        dto: [SubgraphDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some subgraphs could not be retrieved (see errors array)',
        dto: [SubgraphDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraphs',
      },
    ],
  })
  async querySubgraphs(
    @Param('projectId') projectId: string,
    @Body() subgraphSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<SubgraphDto[]>> {
    // Parse string IDs to integers — radix 10 guards against octal misparse on '0'-prefixed strings
    const systemIds = subgraphSystemIds.systemIds.map(id => {
      const parsed = Number.parseInt(id, 10);
      if (Number.isNaN(parsed)) {
        throw new BadRequestException(`Invalid system ID: ${id}`);
      }
      return parsed;
    });

    const query = new SubgraphsQuery(
      systemIds,
      Number.parseInt(projectId, 10), // radix 10 — see above
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<Result<SubgraphReadModel[]>>(query);

    if (result.kind === RESULT_KIND.Fail) {
      throw new UnprocessableEntityException(
        result.issues?.[0]?.message ?? 'Failed to retrieve subgraphs',
      );
    }

    return {
      data: result.data.map(s => this.mapToSubgraphDto(s)),
    };
  }

  /**
   * Get all property data for a subgraph (subgraph, container, subsystem, module).
   */
  @Get('/:subgraphSystemId/properties')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a subgraph',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: SubgraphPropertiesDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — one or more property payloads missing (see issues array)',
        dto: SubgraphPropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
    ],
  })
  async getSubgraphProperties(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<SubgraphPropertiesDto>> {
    const query = new GetSubgraphPropertiesQuery(
      Number.parseInt(projectId, 10),
      Number.parseInt(subgraphSystemId, 10),
      'client-id',
    );
    const result =
      await this.queryBus.execute<Result<PropertyDataDto[]>>(query);
    return toApiResult(
      result,
      properties =>
        new SubgraphPropertiesDto(properties.map(p => mapPropertyToDto(p))),
    );
  }

  /**
   * Get all usecases for a given subgraph system id.
   */
  @Get('/:subgraphSystemId/usecases')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph to get usecases for',
    example: 'subgraph-123',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all usecases for a given subgraph system id',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Usecases are returned successfully',
        dto: [UsecaseIdentifierDto],
        example: {
          className: 'UseCaseIdentifierCollectionExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
    ],
  })
  async getUsecasesForSubgraph(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<UsecaseIdentifierDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting all usecases for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getUsecasesForSubgraph is not implemented yet',
    );
  }

  /**
   * Get all components (modules, data links, control links) for a subgraph.
   */
  @Get('/:subgraphSystemId/components')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all components for a subgraph',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Components returned successfully',
        dto: ComponentCollectionDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some components could not be retrieved (see errors array)',
        dto: ComponentCollectionDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components',
      },
    ],
  })
  async getComponentsForSubgraph(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<ComponentCollectionDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    const parsedSubgraphId = Number.parseInt(subgraphSystemId, 10);

    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }
    if (Number.isNaN(parsedSubgraphId)) {
      throw new BadRequestException(
        `Invalid subgraph system ID: ${subgraphSystemId}`,
      );
    }

    const query = new GetComponentsQuery(
      {type: COMPONENT_SCOPE_TYPE.Subgraph, systemId: parsedSubgraphId},
      parsedProjectId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<ComponentsReadModel>>(query);

    return toApiResult(result, data => this.mapToComponentCollectionDto(data));
  }

  /**
   * Get all subgraph pairs where the given subgraph is source or destination.
   */
  @Get('/:subgraphSystemId/subgraph-pairs')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all subgraph pairs for a subgraph (as source or destination)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subgraph pairs returned successfully',
        dto: [SubgraphPairDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraph pairs',
      },
    ],
  })
  async getSubgraphPairs(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<SubgraphPairDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subgraph pairs for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getSubgraphPairs is not implemented yet',
    );
  }

  // ── Private mapper ───────────────────────────────────────────────────────────

  private mapToComponentCollectionDto(
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

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Maps SubgraphReadModel → SubgraphDto.
   * changeInfo is left undefined — this endpoint doesn't surface change state.
   */
  private mapToSubgraphDto(s: SubgraphReadModel): SubgraphDto {
    const dto = new SubgraphDto(String(s.systemId), s.subgraphId);
    dto.name = s.name;
    dto.subGraphSharedType = s.isExported
      ? SharedType.Exported
      : SharedType.None;
    dto.SGKV = (s.sgkvs ?? []).map(sgkv => this.mapSgkvToDto(sgkv));
    return dto;
  }

  private mapSgkvToDto(sgkv: KeyValuePairListReadModel): KeyValuePairsInfo {
    const keyValueCollection = (sgkv.keyValuePairs ?? [])
      .filter(kv => kv?.key && kv?.value)
      .map(
        kv =>
          new KeyValueInfo(
            new KeyInfo(kv.key.keyId, kv.key.name, String(kv.key.systemId)),
            new ValueInfo(
              kv.value.valueId,
              kv.value.name,
              String(kv.value.systemId),
            ),
          ),
      );
    const dto = new KeyValuePairsInfo(keyValueCollection);
    dto.systemId = String(sgkv.systemId);
    return dto;
  }
}
