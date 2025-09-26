import { ApiProperty } from "@nestjs/swagger";

export class DeviceInfo
{
    
@ApiProperty({ description: 'Unique system identifier for the device' })
systemId!: string;

@ApiProperty({ description: 'Name of the device' })
deviceName!: string;

@ApiProperty({ description: 'Description of the device' })
deviceDescription!: string;

@ApiProperty({ description: 'Communication protocol used by the device' })
protocol!: string;
}