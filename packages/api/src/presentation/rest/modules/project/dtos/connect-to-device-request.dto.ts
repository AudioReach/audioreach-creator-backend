import { ApiProperty } from "@nestjs/swagger";

/** DTO for connecting to a device */
export class ConnectToDeviceRequest {
    @ApiProperty({ description: 'Multi ACDB client identifier' })
    multiAcdbClientId!: string;


}
