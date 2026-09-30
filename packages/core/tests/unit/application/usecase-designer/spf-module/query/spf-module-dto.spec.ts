/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {PORT_IO_TYPE} from '../../../../../../src/domain/entities/common/enums/port-io-type.js';
import {
  mapDataPort,
  DataPortDtoSchema,
} from '../../../../../../src/application/usecase-designer/spf-module/query/spf-module-dto.js';
import type {DataPortReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/ports/data-port-read-model.js';

describe('mapDataPort', () => {
  it('maps every domain port direction to its API label', () => {
    const basePort: Omit<DataPortReadModel, 'portIoType'> = {
      systemId: 101,
      naturalId: 1,
      name: 'port',
      isStatic: true,
      totalLinksAtPort: 0,
    };

    expect(
      mapDataPort({...basePort, portIoType: PORT_IO_TYPE.Input}).portIoType,
    ).toBe('Input');
    expect(
      mapDataPort({...basePort, portIoType: PORT_IO_TYPE.Output}).portIoType,
    ).toBe('Output');
    expect(
      mapDataPort({...basePort, portIoType: PORT_IO_TYPE.InputOutput})
        .portIoType,
    ).toBe('InputOutput');
    expect(
      mapDataPort({...basePort, portIoType: PORT_IO_TYPE.OutputInput})
        .portIoType,
    ).toBe('OutputInput');
  });

  it('produces output that passes DataPortDtoSchema validation', () => {
    const dto = mapDataPort({
      systemId: 101,
      naturalId: 1,
      name: 'input',
      portIoType: PORT_IO_TYPE.Input,
      isStatic: true,
      totalLinksAtPort: 0,
    });

    expect(DataPortDtoSchema.safeParse(dto).success).toBe(true);
  });
});
