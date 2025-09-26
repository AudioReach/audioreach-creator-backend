import { ApiProperty } from "@nestjs/swagger";

export class ApiResult<T> {
  @ApiProperty({ required: false })
  data?: T;

  @ApiProperty({ type: [String], required: false })
  errors?: string[];

  @ApiProperty({ type: [String], required: false })
  warnings?: string[];

  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;
}
