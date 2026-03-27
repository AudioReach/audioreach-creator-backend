/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class EndPointLink {
  @ApiProperty({
    description: "Hypertext reference URL following 'project{projectId}'",
  })
  hypertextRef: string = '';

  @ApiProperty({description: 'HTTP method'})
  method: string = '';

  @ApiProperty({description: 'Description of the endpoint'})
  description: string = '';
}
