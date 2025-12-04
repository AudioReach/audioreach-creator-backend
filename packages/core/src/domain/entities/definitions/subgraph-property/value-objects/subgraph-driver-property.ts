import {PropertyDefinition} from '../../common/entities/property-definition.js';
import {
  DuplicatePropertyIdException,
  DuplicateSystemIdException,
  NullObjectException,
  PropertyIdNotFoundException,
  SystemIdNotFoundException,
} from '../../common/exceptions/input-validation-exception.js';

export class SubgraphDriverProperty {
  readonly propertyDefinitions: PropertyDefinition[] = [];

  AddPropertyDefinition(propertyDefinition: PropertyDefinition): void {
    if (!propertyDefinition) {
      throw new NullObjectException('Value is null');
    }

    if (propertyDefinition.systemId == undefined) {
      throw new SystemIdNotFoundException();
    }

    if (!propertyDefinition.propertyId) {
      throw new PropertyIdNotFoundException();
    }

    const valueWithSameSystemId = this.propertyDefinitions.some(
      v => v.systemId === propertyDefinition.systemId,
    );
    if (valueWithSameSystemId) {
      throw new DuplicateSystemIdException(
        `SystemId ${propertyDefinition.systemId} already exists in Subgraph PropertyDefinition`,
      );
    }

    const valueWithSamePropertyId = this.propertyDefinitions.some(
      v => v.propertyId === propertyDefinition.propertyId,
    );
    if (valueWithSamePropertyId) {
      throw new DuplicatePropertyIdException(
        `PropertyId ${propertyDefinition.propertyId} already exists in Subgraph PropertyDefinition`,
      );
    }

    this.propertyDefinitions.push(propertyDefinition);
  }
}
