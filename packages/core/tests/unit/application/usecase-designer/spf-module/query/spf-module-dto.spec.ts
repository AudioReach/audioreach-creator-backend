/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {PORT_IO_TYPE} from '../../../../../../src/domain/entities/common/enums/port-io-type.js';
import {
  mapDataPort,
  mapSpfModule,
  ModuleDataPortDtoSchema,
} from '../../../../../../src/application/usecase-designer/spf-module/query/spf-module-dto.js';
import type {DataPortReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/ports/data-port-read-model.js';
import type {SpfModuleReadModel} from '../../../../../../src/application/ports/persistence/query-services/spf-module/spf-module-read-model.js';

describe('mapDataPort', () => {
  it('maps module input and output port directions to API labels', () => {
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
    expect(() =>
      mapDataPort({...basePort, portIoType: PORT_IO_TYPE.InputOutput}),
    ).toThrow('invalid IO type');
  });

  it('produces output that passes ModuleDataPortDtoSchema validation', () => {
    const dto = mapDataPort({
      systemId: 101,
      naturalId: 1,
      name: 'input',
      portIoType: PORT_IO_TYPE.Input,
      isStatic: true,
      totalLinksAtPort: 0,
    });

    expect(ModuleDataPortDtoSchema.safeParse(dto).success).toBe(true);
  });
});

describe('mapSpfModule', () => {
  const module: SpfModuleReadModel = {
    systemId: 1,
    parentSystemId: null,
    naturalId: 2,
    definitionSystemId: 3,
    name: 'Display name',
    moduleDefinitionNaturalId: 4,
    subgraphSystemId: 5,
    containerSystemId: 6,
    maxInputPortsSupported: 0,
    maxOutputPortsSupported: 0,
    maxControlPortsSupported: 0,
    dataPorts: [],
    controlPorts: [],
  };

  it('omits an alias unless the module has an actual alias', () => {
    expect(mapSpfModule(module)).not.toHaveProperty('alias');
    expect(mapSpfModule({...module, alias: 'My module'}).alias).toBe(
      'My module',
    );
  });
});
