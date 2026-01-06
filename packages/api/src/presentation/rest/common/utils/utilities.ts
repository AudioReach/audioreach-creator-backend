import {ApiProperty} from '@nestjs/swagger';

export class EndPointLink {
  @ApiProperty({
    description: "Hypertext reference URL following 'project{projectId}'",
  })
  hypertextRef: string = '';

  @ApiProperty({description: 'HTTP method', example: 'GET'})
  method: string = '';

  @ApiProperty({description: 'Description of the endpoint'})
  description: string = '';
}
