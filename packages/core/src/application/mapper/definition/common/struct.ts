import { Type } from 'class-transformer';
import { BaseElement } from './base-element.js';
import { ConfigElement } from './config-element.js';
import { ConfigElementArray } from './config-element-array.js';

/**
 * Represents a structure element with children elements.
 * Extends BaseElement with structure-specific properties.
 */
export class Struct extends BaseElement {
  /** Structure type (required) */
  structureType!: string;

  /** List of child elements (required) */
  @Type(() => BaseElement, {
    discriminator: {
      property: 'elementType',
      subTypes: [
        { value: ConfigElement, name: 'ConfigElement' },
        { value: ConfigElementArray, name: 'ConfigElementArray' },
        { value: Struct, name: 'Struct' },
      ],
    },
    keepDiscriminatorProperty: true,
  })
  children!: (ConfigElement | ConfigElementArray | Struct)[];
}
