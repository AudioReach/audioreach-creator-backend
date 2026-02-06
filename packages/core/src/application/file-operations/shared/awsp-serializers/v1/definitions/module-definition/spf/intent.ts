import {Expose} from 'class-transformer';
import {IsNotEmpty, IsNumber, IsOptional, IsString} from 'class-validator';

/**
 * Represents an intent with identifier, name, and max ports.
 */
export class Intent {
  /** Intent identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Intent name (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;

  /** Maximum number of ports (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  maxports!: number;
}
