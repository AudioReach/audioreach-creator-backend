import { Controller, UseGuards} from '@nestjs/common';
import { ApiTags, ApiParam, ApiExtraModels } from '@nestjs/swagger';
import { BaseController } from '../common/base.controller.js';
import { AuthGuard } from '@nestjs/passport';
import {
    BaseComponentDto,
    SystemIdsRequestDto,
    PropertyDto
} from '../common/dtos/index.js';
import { NewDataPortRequest } from './dto/component-request.dto.js';

/**
 * Controller to support all component related APIs for usecase design
 * Provides APIs for all component related APIs for usecase design.
 * Converted from C# UseCaseDesignController class
 */
@ApiTags('components')
@Controller('arcapi/v1/projects/:projectId/components')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
    name: 'projectId',
    type: 'string',
    description: 'The unique identifier of the project',
    example: '12345'
})
@ApiExtraModels(BaseComponentDto, PropertyDto, NewDataPortRequest, SystemIdsRequestDto)
export class ComponentController extends BaseController {
    constructor() {
        super();
    }

    
}
