import type { PropertyDefinition } from "./property-definition.entity.js";
import { DuplicatePropertyIdException, DuplicateSystemIdException, NullObjectException, PropertyIdNotFoundException, SystemIdNotFoundException } from "../exceptions/input-validation-exception.js";

export interface PropertyCategoryInit {
    systemId: number;
    categoryId: string;
    categoryName: string;
}

export abstract class PropertyCategory {
    systemId: number;
    readonly categoryId: string;
    categoryName: string;
    readonly properties: PropertyDefinition[] = [];
    constructor(initParam: PropertyCategoryInit) {
        this.systemId = initParam.systemId;
        this.categoryId = initParam.categoryId;
        this.categoryName = initParam.categoryName;
    }

    AddPropertyDefinition(propertyDefinition: PropertyDefinition): void {        
        if (propertyDefinition == null) {
            throw new NullObjectException("Value is null");
        }

        if (propertyDefinition.systemId == null) {
            throw new SystemIdNotFoundException();
        }

        if (propertyDefinition.propertyId == null) {
            throw new PropertyIdNotFoundException();
        }

        // Check if systemId already exists in current values
        const valueWithSameSystemId = this.properties.some(v => v.systemId === propertyDefinition.systemId);
        if (valueWithSameSystemId) {
            throw new DuplicateSystemIdException(`SystemId ${propertyDefinition.systemId} already exists in PropertyDefinition for Category: ${this.categoryId}`)
        }

        const valueWithSamePropertyId = this.properties.some(v => v.propertyId === propertyDefinition.propertyId);
        if (valueWithSamePropertyId) {
            throw new DuplicatePropertyIdException(`PropertyId ${propertyDefinition.propertyId} already exists in PropertyDefinition for Category: ${this.categoryId}`)
        }

        this.properties.push(propertyDefinition);
    }
}