import {Expose} from 'class-transformer';
import {IsNotEmpty, IsNumber, IsOptional, IsString} from 'class-validator';

/**
 * Represents a port with identifier and name.
 */
export class Port {
  /** Port identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id!: number;

  /** Port name (optional) */
  @Expose()
  @IsOptional()
  @IsString()
  name?: string;
}
