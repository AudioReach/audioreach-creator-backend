import { Expose } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

/**
 * Represents a tag key definition with identifier, name, and enumeration value.
 */
export class TagKeyDefinition {
  /** Unique identifier for the tag key definition */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Name of the tag key definition */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;

  /** optional enumeration value associated with the tag key definition */
  @Expose()
  @IsOptional()
  @IsString()
  enumValue?: string;
}
