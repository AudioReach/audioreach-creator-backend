import { ApiProperty } from "@nestjs/swagger";

export class RegisterDto {
  @ApiProperty({ description: 'Client name' })
  clientName: string;

  constructor(name: string) {
    this.clientName = name;
  }
}

export class RegisterResponseData {
  @ApiProperty({ description: 'JWT token for authentication' })
  token!: string;

  @ApiProperty({ description: 'Unique client identifier' })
  clientId!: number;

  @ApiProperty({ description: 'Client name' })
  clientName!: string | number;
}
