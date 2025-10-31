import { Controller, Post, Get, Body, Param, HttpStatus, HttpException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiParam } from '@nestjs/swagger';
import { BaseController } from '../common/base.controller.js';
import { AuthGuard } from '@nestjs/passport';
import { SubgraphDto, SubgraphPropertiesDto } from './dto/subgraph.dto.js'
import { SystemIdsRequestDto } from '../common/dtos/index.js';
import { ApiDocumentationWithExample } from '../../common/swagger-doc/swagger.decorator.js';
import { ApiResult } from "../../common/dtos/api-response.dto.js";

/**
 * Controller to support all Switch related APIs for usecase design.
 * Provides Switch related APIs for usecase design.
 * Converted from C# UseCaseDesignController class
 */
@ApiTags('subgraphs')
@Controller('arcapi/v1/projects/:projectId/subgraph')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
    name: 'projectId',
    type: 'string',
    description: 'The unique identifier of the project',
    example: '12345'
})
export class SubgraphController extends BaseController {
    constructor() {
        super();
    }

    /**
       * Get subgraphs for subgraph system ids.
       */
    @Post('get')
    @ApiDocumentationWithExample({
        summary: 'Get subgraphs for subgraph systemIds',
        requestDto: SystemIdsRequestDto,
        requestDtoDescription: 'List of subgraph system ids',

        responses: [
            {
                status: HttpStatus.OK,
                description: 'Success',
                dto: [SubgraphDto],
            },
            {
                status: HttpStatus.NOT_FOUND,
                description: 'Some subgraphs are not found',
            },
            {
                status: HttpStatus.UNPROCESSABLE_ENTITY,
                description: 'Failed to get subgraphs',
            }
        ]
    })
    async getSubgraphs(
        @Param('projectId') projectId: string,
        @Body() subgraphSystemIds: SystemIdsRequestDto,
    ): Promise<ApiResult<SubgraphDto[]>> {
        await Promise.resolve(); // Placeholder to satisfy linter
        console.log(`Getting subgraphs in project ${projectId}: ${JSON.stringify(subgraphSystemIds)}`);
        throw new HttpException(
            'subgraphs retrieval functionality is not implemented yet.',
            HttpStatus.NOT_IMPLEMENTED
        );
    }

    /**
     * Get all property data for a subgraph (subgraph, container, subsystem, module).
     */
    @Get(':subgraphSystemId/properties')
    @ApiParam({ name: 'subgraphSystemId', required: true, type: String, description: 'System id of a subgraph' })
    @ApiDocumentationWithExample({
        summary: 'Get all property data for a subgraph',
        responses: [
            {
                status: HttpStatus.OK,
                description: 'Success',
                dto: SubgraphPropertiesDto,
            },
            {
                status: HttpStatus.NOT_FOUND,
                description: 'Subgraph is not found',
            },
            {
                status: HttpStatus.UNPROCESSABLE_ENTITY,
                description: 'Failed to get subgraph properties',
            }
        ]
    })
    async getSubgraphProperties(
        @Param('projectId') projectId: string,
        @Param('subgraphSystemId') subgraphSystemId: string
    ): Promise<ApiResult<SubgraphPropertiesDto>> {
        await Promise.resolve(); // Placeholder to satisfy linter
        console.log(`Getting properties in project ${projectId} for subgraph ${subgraphSystemId}`);
        throw new HttpException(
            'Subgraph properties retrieval functionality is not implemented yet.',
            HttpStatus.NOT_IMPLEMENTED
        );
    }

    /**
       * Get subgraphs for a module system id.
       */
    @Get(':moduleSystemId')
     @ApiParam({ name: 'moduleSystemId', required: true, type: String, description: 'System id of a module definition' })
    @ApiDocumentationWithExample({
        summary: 'Get all subgraphs for a module system id',

        responses: [
            {
                status: HttpStatus.OK,
                description: 'Success',
                dto: [SubgraphDto],
            },
            {
                status: HttpStatus.NOT_FOUND,
                description: 'Module system id is not found',
            },
            {
                status: HttpStatus.UNPROCESSABLE_ENTITY,
                description: 'Failed to get subgraphs',
            }
        ]
    })
    async getSubgraphsForModuleId(
        @Param('projectId') projectId: string,
        @Param('moduleSystemId') moduleSystemId: string,
    ): Promise<ApiResult<SubgraphDto[]>> {
        await Promise.resolve(); // Placeholder to satisfy linter
        console.log(`Getting subgraphs in project ${projectId} for module system id: ${moduleSystemId}`);
        throw new HttpException(
            'subgraphs retrieval functionality is not implemented yet.',
            HttpStatus.NOT_IMPLEMENTED
        );
    }
   
}
