import {
  Controller,
  Get,
  Post,
  //  UseGuards,
  HttpStatus,
  HttpException,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import {ApiTags, ApiQuery, ApiExtraModels, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../common/base.controller.js';
import {
  ComponentsTypeInUsecase,
  UsecaseIdentifier,
  UsecaseDto,
  UsecaseComponentsDto,
  UsecaseWithModificationSummary,
  UsecaseType,
} from './dto/usecase.dto.js';
import {ModuleInstanceDto} from '../module-instance/dto/module-instance.dto.js';
import {DataLinkDto} from '../data-link/dto/data-link.dto.js';
import {ControlLinkDto} from '../control-link/dto/control-link.dto.js';
import {BaseComponentDto, SystemIdsRequestDto} from '../common/dtos/index.js';
//import {AuthGuard} from '@nestjs/passport';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {QueryBus, GetAllUseCasesQuery, GetComponentsQuery} from '@arc/core';
import type {
  UseCaseReadModel,
  KeyVectorReadModel,
  UseCaseComponentsReadModel,
} from '@arc/core';
import {KVInfo, KeyValueInfo} from '../common/dtos/kv.dto.js';
import {CONN_CTRL_TYPE} from '../../common/utils/enums.js';

/**
 * Controller to support all usecase/graph related APIs
 * Converted from C# UseCaseDesignController class
 */
@ApiTags('usecases')
@Controller('arc-api/v1/projects/:projectId/usecases')
//@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
@ApiExtraModels(
  UsecaseIdentifier,
  UsecaseDto,
  UsecaseWithModificationSummary,
  BaseComponentDto,
  ModuleInstanceDto,
)
export class UseCaseController extends BaseController {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  /**
   * Get all usecases
   */
  @Get('allUsecases')
  @ApiDocumentationWithExample({
    summary: 'Get all usecases',
    description:
      'Returns array of usecases in a unified format that handles two scenarios:\n\n' +
      '**Scenario 1 (isFiltered=false):** No subsystem present\n' +
      '- `isFiltered`: false\n' +
      '- `filteredKV`: null\n' +
      '- `usecases`: all UsecaseIdentifiers without subsystem filtered\n\n' +
      '**Scenario 2 (isFiltered=true):** Subsystem present with filtered KV\n' +
      '- `isFiltered`: true\n' +
      '- `filteredKV`: Contains the subsystem filtered key-value\n' +
      '- `usecases`: Array of UsecaseIdentifiers filtered by the filtered GKV\n\n' +
      'Each response item uses the `isFiltered` boolean flag to indicate which scenario applies.',
    responses: [
      {
        status: HttpStatus.OK,
        description:
          'Use cases are returned successfully with scenario indicators',
        dto: [UsecaseDto],
        example: {
          className: 'SubsystemFilteredUseCaseCollectionExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'No use case is found',
      },
    ],
  })
  async getAllUsecases(
    @Param('projectId') projectId: string,
  ): Promise<ApiResult<UsecaseDto[]>> {
    try {
      console.log(
        `Getting subsystem filtered usecases for project: ${projectId}`,
      );

      // Execute the query using the existing handler
      const query = new GetAllUseCasesQuery(parseInt(projectId), 'client-id'); // TODO: get actual clientId from JWT
      const usecases = await this.queryBus.execute<UseCaseReadModel[]>(query);

      // Transform UseCaseReadModel[] to UsecaseDto[]
      const transformedUsecases = this.transformToUsecaseDtos(usecases);

      return {
        data: transformedUsecases,
        success: true,
        message: 'Usecases retrieved successfully',
      };
    } catch (error) {
      console.error('Error getting usecases:', error);
      throw new HttpException(
        'Failed to retrieve usecases',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Transform UseCaseReadModel[] to UsecaseDto[]
   * Creates raw GKV scenario responses (isFiltered = false)
   */
  private transformToUsecaseDtos(usecases: UseCaseReadModel[]): UsecaseDto[] {
    return usecases.map(usecase => {
      // Transform KeyVectorReadModel[] to KeyValueInfo[]
      const keyValueCollection = this.transformKeyVectors(usecase.gkv);

      // Create KVInfo from the key-value collection
      const kvInfo = new KVInfo(keyValueCollection);
      kvInfo.systemId = usecase.systemId.toString();

      // Create UsecaseIdentifier
      const usecaseIdentifier = new UsecaseIdentifier(
        usecase.systemId.toString(),
        UsecaseType.Regular, // Default type, could be determined from data
        kvInfo,
        usecase.aliasId,
        usecase.alias,
        usecase.categories?.join(','), // Convert array to string if needed
      );

      // Create UsecaseDto using raw GKV scenario (isFiltered = false)
      return UsecaseDto.createRawGKVResponse(usecaseIdentifier);
    });
  }

  /**
   * Transform KeyVectorReadModel[] to KeyValueInfo[]
   */
  private transformKeyVectors(
    keyVectors: KeyVectorReadModel[],
  ): KeyValueInfo[] {
    return keyVectors.map(
      kv =>
        new KeyValueInfo(
          kv.key.keyId,
          kv.value.valueId,
          kv.key.name,
          kv.value.name,
        ),
    );
  }

  /**
   * Transform UseCaseComponentsReadModel to UsecaseComponentsDto
   */
  private transformToUsecaseComponentsDto(
    components: UseCaseComponentsReadModel,
  ): UsecaseComponentsDto {
    // Create a dummy usecase identifier for the constructor
    const dummyKvInfo = new KVInfo([]);
    const dummyUsecaseIdentifier = new UsecaseIdentifier(
      '0',
      UsecaseType.Regular,
      dummyKvInfo,
    );

    const usecaseComponentsDto = new UsecaseComponentsDto(
      dummyUsecaseIdentifier,
    );

    // Transform modules to ModuleInstanceDto
    usecaseComponentsDto.moduleInstances = components.modules.map(module => {
      const moduleDto = new ModuleInstanceDto(
        module.systemId.toString(),
        module.instanceId,
        module.definitionSystemId,
        module.name,
      );
      moduleDto.subgraphId = module.subgraph.systemId;
      moduleDto.containerId = module.container.systemId;
      return moduleDto;
    });

    // Transform data links to DataLinkDto
    usecaseComponentsDto.dataLinks = components.dataLinks.map(
      link =>
        new DataLinkDto(
          link.systemId.toString(),
          link.systemId, // Using systemId as id for now
          CONN_CTRL_TYPE.MODULE_MODULE, // Default connection type
          link.sourceNodeSystemId,
          link.sourcePortSystemId,
          link.destinationNodeSystemId,
          link.destinationPortSystemId,
          false, // isDangling - default to false
        ),
    );

    // Transform control links to ControlLinkDto
    usecaseComponentsDto.controlLinks = components.controlLinks.map(
      link =>
        new ControlLinkDto(
          link.systemId.toString(),
          link.systemId, // Using systemId as id for now
          CONN_CTRL_TYPE.MODULE_MODULE, // Default connection type
          link.peerNodeASystemId,
          link.nodeAPortSystemId,
          link.peerNodeBSystemId,
          link.nodeBPortSystemId,
          false, // isDangling - default to false
          undefined, // parentId
        ),
    );

    // Initialize subsystems as empty array for now
    usecaseComponentsDto.subsystems = [];

    return usecaseComponentsDto;
  }

  /**
   * Get all usecases without any subsystem information.
   */
  // @Get()
  // @ApiDocumentationWithExample({
  //     summary: 'Get all usecases without any subsystem information',
  //     responses: [
  //         {
  //             status: HttpStatus.OK,
  //             description: 'Raw use cases are returned successfully',
  //             dto: [UsecaseIdentifier],
  //             example: {
  //                 className: 'UseCaseIdentifierCollectionExample'
  //             }
  //         },
  //         {
  //             status: HttpStatus.NOT_FOUND,
  //             description: 'No raw use case is found',
  //         }
  //     ]
  // })
  // async getAllRawUsecases(@Param('projectId') projectId: string): Promise<ApiResult<UsecaseIdentifier[]>> {
  //     await Promise.resolve(); // Placeholder to satisfy linter
  //     console.log(`Getting all raw usecases for project: ${projectId}`);
  //     throw new HttpException(
  //         'Raw usecases retrieval functionality is not implemented yet.',
  //         HttpStatus.NOT_IMPLEMENTED
  //     );
  // }

  /**
   * Get all usecases for a given subgraph system id.
   */
  @Get('subgraph')
  @ApiQuery({
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
        dto: [UsecaseIdentifier],
        example: {
          className: 'UseCaseIdentifierCollectionExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph is not found',
      },
    ],
  })
  async getUsecasesForSubgraph(
    @Param('projectId') projectId: string,
    @Query('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<UsecaseIdentifier[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting all usecases for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new HttpException(
      'Usecases retrieval functionality for subgraph is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get all components for usecase(s). For components shared between usecases, only one copy will be returned.
   */
  @Post('components/get')
  @ApiDocumentationWithExample({
    summary:
      'Get all components (including module instances, data links, control links, subsystems) for usecase(s) based on querying type.',
    description:
      'For components shared in different usecases, only one copy will be returned.',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of system ids for usecases',
    requestDtoExample: {
      className: 'UseCaseIdCollectionExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Components are returned successfully',
        dto: [UsecaseComponentsDto],
        example: {
          className: 'UsecaseComponentsExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Usecase is not found for provided usecase id',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components for usecase(s)',
      },
    ],
  })
  @ApiQuery({
    name: 'contentsType',
    required: false,
    enum: ComponentsTypeInUsecase,
    description:
      'Type of contents to be returned. Optional. If not provided, default is TopLevelComponents.\n\n' +
      "'TopLevelComponents' - only top level components and links of a usecase. If a subsystem is in top level, its internal components are not returned.\n\n" +
      "'LowLevelComponents' - only modules and links of a usecase. No subystem and related links will be returned\n\n" +
      "'AllComponents' - all components of a usecase, including subystem and its internal componnents (even nested subsystem and its internal components.",
  })
  async getComponentsInUsecases(
    @Param('projectId') projectId: string,
    @Body() usecaseSystemIds: SystemIdsRequestDto,
    @Query('contentsType')
    contentsType: ComponentsTypeInUsecase = ComponentsTypeInUsecase.TopLevel,
  ): Promise<ApiResult<UsecaseComponentsDto[]>> {
    try {
      console.log(
        `Getting components for usecases in project ${projectId}: ${JSON.stringify(usecaseSystemIds)}, contentsType: ${contentsType}`,
      );

      // Validate input
      if (
        !usecaseSystemIds ||
        !usecaseSystemIds.systemIds ||
        usecaseSystemIds.systemIds.length === 0
      ) {
        throw new HttpException(
          'systemIds array is required and cannot be empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Convert string systemIds to numbers
      const systemIds = usecaseSystemIds.systemIds.map(id => {
        const parsed = parseInt(id, 10);
        if (isNaN(parsed)) {
          throw new HttpException(
            `Invalid use case system ID: ${id}`,
            HttpStatus.BAD_REQUEST,
          );
        }
        return parsed;
      });

      // Execute the query using the new handler
      const query = new GetComponentsQuery(systemIds, 'client-id'); // TODO: get actual clientId from JWT
      const components =
        await this.queryBus.execute<UseCaseComponentsReadModel>(query);

      // Transform the response to UsecaseComponentsDto format
      const transformedComponents =
        this.transformToUsecaseComponentsDto(components);

      return {
        data: [transformedComponents], // Wrap in array to match the expected return type
        success: true,
        message: 'Components retrieved successfully',
      };
    } catch (error) {
      console.error('Error getting components:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Failed to retrieve components for usecase(s)',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all added and deleted usecases with their modification summary.
   */
  @Get('updates/summary')
  @ApiDocumentationWithExample({
    summary:
      'Get all added and deleted usecases with their modification summary',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [UsecaseWithModificationSummary],
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get modification summary)',
      },
    ],
  })
  async getUsecaseModificationSummary(
    @Param('projectId') projectId: string,
  ): Promise<ApiResult<UsecaseWithModificationSummary[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting usecase modification summary for project: ${projectId}`,
    );
    throw new HttpException(
      'This getUsecaseModificationSummary API endpoint is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

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
        description: 'Success',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some usecase(s) cannot be found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to delete some usecase(s))',
      },
    ],
  })
  async deleteUsecases(
    @Param('projectId') projectId: string,
    @Body() usecaseSystemIds: SystemIdsRequestDto,
  ): Promise<void> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Deleting usecases for project ${projectId}: ${JSON.stringify(usecaseSystemIds)}`,
    );
    throw new HttpException(
      'This API endpoint is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
