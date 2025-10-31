import { EndPointLink } from '../../../common/utils/utilities.js';
import { ApiProperty } from '@nestjs/swagger';
import { BaseComponentDto } from './BaseComponent.dto.js';
import { DataPortDto } from './data-port.dto.js';
import { ControlPortDto } from './control-port.dto.js';

export class BaseConnectableComponentDto extends BaseComponentDto<number> {
    private _parentId?: number;
    private _dataPorts: DataPortDto[] = [];
    private _controlPorts: ControlPortDto[] = [];

    @ApiProperty({ description: 'Parent component ID', required: false })
    get parentId(): number | undefined {
        return this._parentId;
    }

    set parentId(value: number | undefined) {
        this._parentId = value;
    }

    @ApiProperty({ description: 'Data ports', type: [DataPortDto] })
    get dataPorts(): DataPortDto[] {
        return this._dataPorts;
    }

    set dataPorts(value: DataPortDto[]) {
        this._dataPorts = value;
    }

    @ApiProperty({ description: 'Control ports', type: [ControlPortDto] })
    get controlPorts(): ControlPortDto[] {
        return this._controlPorts;
    }

    set controlPorts(value: ControlPortDto[]) {
        this._controlPorts = value;
    }

    constructor(systemId: string, id: number) {
        super(systemId, id);
        const endPointLink = new EndPointLink();
        endPointLink.hypertextRef = `/components/${systemId}/properties`;
        endPointLink.method = "GET";
        endPointLink.description = "Get properties for a component.";
        this.relatedEndPointLinks = [endPointLink];
    }
}

export class SystemIdsRequestDto {
    @ApiProperty({ type: [String], description: 'Array of system IDs' })
    systemIds!: string[];
}

