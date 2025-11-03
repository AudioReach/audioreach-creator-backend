import { ApiProperty } from "@nestjs/swagger";

export class ProcessorInfo {
    @ApiProperty({ description: 'Unique system identifier for the processor' })
    systemId!: string;

    @ApiProperty({ description: 'Processor identifier' })
    processorId!: number;

    @ApiProperty({ description: 'Processor name' })
    name!: string; 
}