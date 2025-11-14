import { Type } from 'class-transformer';
import { BaseArrayElement } from './base-array-element.js';
import { Struct } from './struct.js';

/**
 * Represents a structure array element.
 * Extends ArrayElement with structure-specific properties.
 */
export class StructArray extends BaseArrayElement {
  /** Key structure definition (required) */
  @Type(() => Struct)
  keyStructureDefinition!: Struct;
}
