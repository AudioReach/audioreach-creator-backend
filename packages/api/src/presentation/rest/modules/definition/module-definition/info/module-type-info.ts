import { ApiProperty } from "@nestjs/swagger";
import { MajorModuleType } from "../enums/major-module-type.enum.js";
import { BuildType } from "../enums/build-type.enum.js";

export class ModuleTypeInfo {
  @ApiProperty({ description: 'Major module type', enum: MajorModuleType })
  majorModuleType!: MajorModuleType;

  @ApiProperty({ description: 'Build type', enum: BuildType })
  buildType!: BuildType;

  @ApiProperty({ description: 'Indicates if the module is island‑friendly', required: false })
  islandFriendly?: boolean;
}
