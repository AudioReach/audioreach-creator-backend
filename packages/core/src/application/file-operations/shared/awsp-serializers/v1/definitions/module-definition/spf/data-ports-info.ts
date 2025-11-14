import { Expose, Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsNumber, ValidateNested } from 'class-validator';
import { Port } from './port.js';

/**
 * Represents data ports information with maximum ports and port list.
 */
export class DataPortsInfo {
  /** Maximum number of ports (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  maxPortCount!: number;

  /** List of ports (required) */
  @Expose()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Port)
  ports!: Port[];
}
