import { ApiProperty } from "@nestjs/swagger";
import { DeviceInfo } from "./device-info.dto.js";

export class DeviceDetailInfo extends DeviceInfo {
@ApiProperty({ description: 'Indicates if the workspace file exists on the device' })
workspaceFileExists!: boolean;

@ApiProperty({ description: 'Indicates if the device supports multi-ACDB client' })
multiAcdbClient!: boolean;

@ApiProperty({ required: false, description: 'List of multi-ACDB client IDs if applicable' })
multiAcdbClientIds?: string[];

}