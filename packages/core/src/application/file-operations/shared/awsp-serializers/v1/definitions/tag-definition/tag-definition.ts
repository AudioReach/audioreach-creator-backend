import { Expose, Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { TagKeyDefinition } from './tag-key-definition.js';

/**
 * Represents a tag definition with metadata and supported keys.
 */
export class TagDefinition {
  /** Unique identifier for the tag definition (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Name of the tag definition (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;

  /** Description of the tag definition (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  /** Collection of supported key definitions for this tag (optional) */
  @Expose()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TagKeyDefinition)
  supportedKeys?: TagKeyDefinition[];

  /** Indicates whether this tag is voice-related (optional) */
  @Expose()
  @IsOptional()
  @IsBoolean()
  isVoice?: boolean;

  /** Enumeration name associated with the tag definition (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  enumName?: string;

  /** Enumeration value associated with the tag definition (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  enumValue?: string;
}
