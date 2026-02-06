import {Expose} from 'class-transformer';
import {IsNotEmpty, IsNumber, IsString} from 'class-validator';

/**
 * Represents custom module information.
 */
export class CustomModuleInfo {
  /** Major type identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  majorTypeID!: number;

  /** Interface type identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  interfaceTypeID!: number;

  /** Interface version identifier (required) */
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  interfaceVersionID!: number;

  /** File name (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  fileName!: string;

  /** Entry point tag (required) */
  @Expose()
  @IsNotEmpty()
  @IsString()
  entryPointTag!: string;
}
