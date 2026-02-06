import {Type} from 'class-transformer';
import {BaseArrayElement} from './base-array-element.js';
import {ConfigElement} from './config-element.js';
import type {DisplayType} from './type/display-type.js';
import type {ElementPolicy} from './type/element-policy.js';

/**
 * Represents a configuration element array.
 * Extends ArrayElement with configuration-specific properties.
 */
export class ConfigElementArray extends BaseArrayElement {
  /** Key configuration element (required) */
  @Type(() => ConfigElement)
  keyConfigElement!: ConfigElement;

  /** Display type for the configuration element array (optional) */
  displayType?: DisplayType;

  /** Policy for the configuration element array (optional) */
  policy?: ElementPolicy;

  /** Indicates if the element array is read-only (optional) */
  isReadOnly?: boolean;
}
