import { Expose } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, IsOptional } from 'class-validator';

/**
 * Represents a value definition with identifier and name properties.
 */
export class ValueDefinition {
  /** Unique identifier for the value definition */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Name of the value definition */
  @Expose()
  @IsNotEmpty()
  @IsString()
  name!: string;

  /** Optional description providing additional details about the value definition */
  @Expose()
  @IsOptional()
  @IsString()
  description?: string;

  /** Optional enumeration value associated with the value definition */
  @Expose()
  @IsOptional()
  @IsString()
  enumValue?: string;

  /** Optional special value that should be filled when SpecialKey exists in the parent KeyDefinition */
  @Expose()
  @IsOptional()
  @IsString()
  specialValue?: string;
}
