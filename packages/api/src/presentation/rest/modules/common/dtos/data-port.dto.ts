import { ComponentInfoType } from '../../../common/utils/enums.js';
import { ApiProperty } from '@nestjs/swagger';
import { BaseComponentDto } from './BaseComponent.dto.js';

/**
 * Converted from C# enum PortIoType
 */
export enum PortIoType {
    Input = 'Input',
    Output = 'Output'
}

/**
 * Converted from C# enum PortType
 */
export enum PortType {
    Static = 'Static',
    Dynamic = 'Dynamic'
}

/**
 * Converted from C# class DataPortDTO
 */
export class DataPortDto extends BaseComponentDto<number> {
    private _portIoType: PortIoType = PortIoType.Input;
    private _portType: PortType = PortType.Static;
    private _dataPortName: string = '';

    @ApiProperty({ description: 'Port IO type', enum: PortIoType })
    get portIoType(): PortIoType {
        return this._portIoType;
    }

    @ApiProperty({ description: 'Port type', enum: PortType })
    get portType(): PortType {
        return this._portType;
    }

    @ApiProperty({ description: 'Data port name' })
    get dataPortName(): string {
        return this._dataPortName;
    }

    set dataPortName(value: string) {
        this._dataPortName = value;
    }

    @ApiProperty({ description: 'Component type', enum: ComponentInfoType })
    get componentType(): ComponentInfoType {
        return ComponentInfoType.DataPort;
    }

    constructor(systemId: string, id: number);
    constructor(systemId: string, id: number, name: string, portIoType: PortIoType, portType: PortType, isVirtual?: boolean);
    constructor(systemId: string, id: number, name?: string, portIoType?: PortIoType, portType?: PortType) {
        super(systemId, id);

        if (name !== undefined && portIoType !== undefined && portType !== undefined) {
            this._portIoType = portIoType;
            this._portType = portType;
            this._dataPortName = name;
        }
    }
}
