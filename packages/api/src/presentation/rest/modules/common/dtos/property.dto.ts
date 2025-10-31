import { EndPointLink } from '../../../common/utils/utilities.js';
import { ApiProperty } from '@nestjs/swagger';
import { BaseValueElement } from './pid-data.dto.js';

export class PropertyDto {
    private _systemId: string;
    private _propertyId: number;
    private _propertyName: string;
    private _hasDefinition: boolean;
    private _propertyValues: BaseValueElement[];
    private _definitionLink?: EndPointLink;


    @ApiProperty({ description: 'System ID' })
    get systemId(): string {
        return this._systemId;
    }

    @ApiProperty({ description: 'Property ID' })
    get propertyId(): number {
        return this._propertyId;
    }

    @ApiProperty({ description: 'Property name' })
    get propertyName(): string {
        return this._propertyName;
    }

    @ApiProperty({ description: 'Has definition or not' })
    get hasDefinition(): boolean {
        return this._hasDefinition;
    }

    @ApiProperty({ 
        description: 'Property values',
        type: [BaseValueElement]
    })
    get propertyValues(): BaseValueElement[] {
        return this._propertyValues;
    }

    @ApiProperty({ description: 'Definition link', required: false })
    get definitionLink(): EndPointLink | undefined {
        return this._definitionLink;
    }

    constructor(systemId: string, propertyId: number, propertyName: string, hasDefinition: boolean = false) {
        this._systemId = systemId;
        this._propertyId = propertyId;
        this._propertyName = propertyName;
        this._hasDefinition = hasDefinition;
        this._propertyValues = [];

        // Only create definition link for property types that have definitions
        if (hasDefinition) {
            const link = new EndPointLink();
            link.hypertextRef = `/definition/properties/${hasDefinition}/${this._systemId}`;
            link.method = "GET";
            link.description = "Get property definition.";
            this._definitionLink = link;
        }
    }
}
