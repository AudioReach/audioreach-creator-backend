import { ApiProperty } from '@nestjs/swagger';
import { BaseConnectableComponentDto } from '../../../modules/common/dtos/component.dto.js';
import { PropertyDto } from '../../../modules/common/dtos/index.js';
import { ComponentInfoType } from '../../../common/utils/enums.js';


/**
 * DTO for module instance properties
 */
export class ModuleInstancePropertiesDto {
    @ApiProperty({
        description: 'Array of module instance properties',
        type: [PropertyDto]
    })
    properties: PropertyDto[];

    constructor(properties: PropertyDto[]) {
        this.properties = properties;
    }
}

export class ModuleInstanceDto extends BaseConnectableComponentDto {
    @ApiProperty({ description: 'Module alias' })
    alias!: string;

    @ApiProperty({ description: 'Module ID' })
    moduleId: number;

    @ApiProperty({ description: 'Subgraph ID' })
    subgraphId!: number;

    @ApiProperty({ description: 'Container ID' })
    containerId!: number;

    @ApiProperty({ description: 'Maximum number of input ports supported' })
    maxInputPortsSupported!: number;

    @ApiProperty({ description: 'Maximum number of output ports supported' })
    maxOutputPortsSupported!: number;

    @ApiProperty({ description: 'Maximum number of control ports supported' })
    maxControlPortsSupported!: number;

    @ApiProperty({ description: 'Heap ID' })
    heapId!: number;

    get componentType(): ComponentInfoType {
        return ComponentInfoType.Module;
    }

    constructor(
        systemId: string,
        id: number,
        moduleId: number,
        name: string,
        parentId?: number
    ) {
        super(systemId, id);
        this.moduleId = moduleId;
        this.name = name;
        this.parentId = parentId;
    }
}
