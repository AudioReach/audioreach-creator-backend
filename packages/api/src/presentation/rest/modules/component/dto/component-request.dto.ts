import { ApiProperty } from '@nestjs/swagger';
import { PROPERTY_TYPE } from '../../../common/utils/index.js';
import { BaseValueElement } from '../../common/dtos/index.js';

/**
 * DTO for new data port request
 */
export class NewDataPortRequest {
    @ApiProperty({
        description: 'Port I/O type',
    })
    portName!: string;

    @ApiProperty({
        description: 'Port number',
    })
    portIndex!: number;
}

export class ComponentPropertyRequest {
    private _propertyId: number;
    private _propertyName: string;
    private _propertyType: PROPERTY_TYPE;
    private _propertyValues: BaseValueElement[];

    @ApiProperty({ description: 'Property ID' })
    get propertyId(): number {
        return this._propertyId;
    }

    @ApiProperty({ description: 'Property name' })
    get propertyName(): string {
        return this._propertyName;
    }

    @ApiProperty({ description: 'Property type', enum: PROPERTY_TYPE })
    get propertyType(): PROPERTY_TYPE {
        return this._propertyType;
    }

    @ApiProperty({ description: 'Property values' })
    get propertyValues(): BaseValueElement[] {
        return this._propertyValues;
    }

    constructor(propertyId: number, propertyName: string, type: PROPERTY_TYPE) {
        this._propertyId = propertyId;
        this._propertyName = propertyName;
        this._propertyType = type;
        this._propertyValues = [];
    }
}
