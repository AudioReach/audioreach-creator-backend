import { ApiProperty } from "@nestjs/swagger";
import { DeviceDetailInfo } from "./device-detail-info.dto.js";

export class ActiveDeviceDetails extends DeviceDetailInfo {


@ApiProperty({
  required: false,
  description: 'The currently active Multi-ACDB client ID associated with the device, if applicable.',
})
activeMultiAcdbClientId?: string;

}