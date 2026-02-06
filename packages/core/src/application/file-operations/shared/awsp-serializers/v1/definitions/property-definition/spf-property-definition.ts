import {Expose} from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import {BasePropertyDefinition} from './base-property-definition.js';

/**
 * Represents an SPF property definition with category and module instance information.
 * Extends BasePropertyDefinition with additional SPF-specific properties.
 */
export class SpfPropertyDefinition extends BasePropertyDefinition {
  /** Category identifier for the SPF property (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  categoryId!: number;

  /** Category name for the SPF property (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  categoryName!: string;

  /** APM module instance identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  apmModuleInstanceId!: number;

  /** Indicates whether this property is voice-related (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  isVoice?: boolean;
}
