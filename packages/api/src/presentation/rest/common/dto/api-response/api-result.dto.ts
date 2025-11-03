import { ApiProperty } from "@nestjs/swagger";


export class ApiResult<T> {
  @ApiProperty({ required: false })
  data?: T;

  @ApiProperty({ type: [String], required: false })
  errors?: String[];

  @ApiProperty({ type: [String], required: false })
  warnings?: String[];

  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  message!: string;
}
