/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {IdentityFormatter} from '../../../../src/application/issues/identity-formatter.js';
import type {
  EntityRef,
  LinkEndpoint,
} from '../../../../src/domain/identity/entity-identity.js';

const formatter = new IdentityFormatter();

const streamTypePlayback = {
  key: {name: 'StreamType', naturalId: 0xa1b2},
  value: {name: 'Playback', naturalId: 0x1},
};
const deviceRxSpeaker = {
  key: {name: 'DeviceRx', naturalId: 0xa2b3},
  value: {name: 'Speaker', naturalId: 0x2},
};

function moduleEndpoint(
  systemId: number,
  naturalId: number,
  portName: string | null,
  portNaturalId = 1,
): LinkEndpoint {
  return {
    node: {
      entityType: 'SpfModule',
      systemId,
      identity: {definitionName: `Module${naturalId}`, naturalId},
    },
    port: {name: portName, naturalId: portNaturalId},
  };
}

describe('IdentityFormatter', () => {
  describe('UseCase', () => {
    it('writes the alias and the GKV pairs by name, in key-vector order', () => {
      const ref: EntityRef = {
        entityType: 'UseCase',
        systemId: 7,
        identity: {
          alias: 'Playback',
          gkv: [streamTypePlayback, deviceRxSpeaker],
        },
      };

      expect(formatter.format(ref)).toBe(
        "UseCase 'Playback' [StreamType:Playback, DeviceRx:Speaker]",
      );
    });

    it('writes only the GKV pairs when there is no alias', () => {
      const ref: EntityRef = {
        entityType: 'UseCase',
        systemId: 7,
        identity: {gkv: [deviceRxSpeaker, streamTypePlayback]},
      };

      expect(formatter.format(ref)).toBe(
        'UseCase [DeviceRx:Speaker, StreamType:Playback]',
      );
    });
  });

  describe('SpfModule', () => {
    it('writes the alias and the module natural ID', () => {
      const ref: EntityRef = {
        entityType: 'SpfModule',
        systemId: 0x10000002,
        identity: {alias: 'RX MFC', definitionName: 'MFC', naturalId: 0xa1b2},
      };

      expect(formatter.format(ref)).toBe("Module 'RX MFC' (0x0000A1B2)");
    });

    it('writes the definition name when there is no alias', () => {
      const ref: EntityRef = {
        entityType: 'SpfModule',
        systemId: 0x10000002,
        identity: {definitionName: 'MFC', naturalId: 0xa1b2},
      };

      expect(formatter.format(ref)).toBe("Module 'MFC' (0x0000A1B2)");
    });
  });

  it.each([
    ['Subgraph', "Subgraph 'Speaker' (0x00000004)"],
    ['Subsystem', "Subsystem 'Speaker' (0x00000004)"],
    ['KeyDefinition', "Key 'Speaker' (0x00000004)"],
    ['TagDefinition', "Tag 'Speaker' (0x00000004)"],
  ] as const)('writes a %s as its name and natural ID', (entityType, text) => {
    const ref: EntityRef = {
      entityType,
      systemId: 99,
      identity: {name: 'Speaker', naturalId: 4},
    };

    expect(formatter.format(ref)).toBe(text);
  });

  it('writes a ValueDefinition as its GKV pair with natural IDs', () => {
    const ref: EntityRef = {
      entityType: 'ValueDefinition',
      systemId: 77,
      identity: streamTypePlayback,
    };

    expect(formatter.format(ref)).toBe(
      'Value StreamType:Playback (0x0000A1B2:0x00000001)',
    );
  });

  describe('DataLink', () => {
    it('writes source to destination, with port names and decimal port natural IDs', () => {
      const ref: EntityRef = {
        entityType: 'DataLink',
        systemId: 5,
        identity: {
          source: moduleEndpoint(1, 0x20, 'out'),
          destination: moduleEndpoint(2, 0x10, null, 2),
        },
      };

      expect(formatter.format(ref)).toBe(
        "DataLink Module 'Module32' (0x00000020) / port 'out' (1) → " +
          "Module 'Module16' (0x00000010) / port 2",
      );
    });

    it('writes an endpoint node without identity as its systemId fallback', () => {
      const ref: EntityRef = {
        entityType: 'DataLink',
        systemId: 5,
        identity: {
          source: {
            node: {entityType: 'Subsystem', systemId: 0x2a},
            port: {name: 'out', naturalId: 1},
          },
          destination: moduleEndpoint(2, 0x10, 'in'),
        },
      };

      expect(formatter.format(ref)).toBe(
        "DataLink Subsystem with systemId: 0x0000002A / port 'out' (1) → " +
          "Module 'Module16' (0x00000010) / port 'in' (1)",
      );
    });
  });

  describe('ControlLink', () => {
    const a = moduleEndpoint(1, 0x20, null, 0x11);
    const b = moduleEndpoint(2, 0x10, null, 0x12);
    const expected =
      "ControlLink Module 'Module16' (0x00000010) / port 0x00000012 ↔ " +
      "Module 'Module32' (0x00000020) / port 0x00000011";

    it.each([
      ['A, B', [a, b]],
      ['B, A', [b, a]],
    ] as const)(
      'writes the same text for endpoints given as %s, ordered by node natural ID',
      (_order, endpoints) => {
        const ref: EntityRef = {
          entityType: 'ControlLink',
          systemId: 9,
          identity: {endpoints},
        };

        expect(formatter.format(ref)).toBe(expected);
      },
    );

    it('puts an endpoint without node identity last', () => {
      const missing: LinkEndpoint = {
        node: {entityType: 'SpfModule', systemId: 0x3},
        port: {name: 'ctrl', naturalId: 1},
      };
      const ref: EntityRef = {
        entityType: 'ControlLink',
        systemId: 9,
        identity: {endpoints: [missing, a]},
      };

      expect(formatter.format(ref)).toBe(
        "ControlLink Module 'Module32' (0x00000020) / port 0x00000011 ↔ " +
          "Module with systemId: 0x00000003 / port 'ctrl' (0x00000001)",
      );
    });

    it('writes a named control port with its hex natural ID', () => {
      const ref: EntityRef = {
        entityType: 'ControlLink',
        systemId: 9,
        identity: {
          endpoints: [
            moduleEndpoint(1, 0x20, 'ctrl', 0x11),
            moduleEndpoint(2, 0x10, null, 0x12),
          ],
        },
      };

      expect(formatter.format(ref)).toBe(
        "ControlLink Module 'Module16' (0x00000010) / port 0x00000012 ↔ " +
          "Module 'Module32' (0x00000020) / port 'ctrl' (0x00000011)",
      );
    });
  });

  describe('systemId fallback', () => {
    it.each([
      ['SpfModule', 'Module with systemId: 0x10000002'],
      ['UseCase', 'UseCase with systemId: 0x10000002'],
      ['ValueDefinition', 'Value with systemId: 0x10000002'],
      ['Container', 'Container with systemId: 0x10000002'],
    ] as const)(
      'writes a %s without identity as its label and hex systemId',
      (entityType, text) => {
        const ref: EntityRef = {entityType, systemId: 0x10000002};

        expect(formatter.format(ref)).toBe(text);
      },
    );

    it('does not write the systemId when the identity is set', () => {
      const ref: EntityRef = {
        entityType: 'Subgraph',
        systemId: 0x10000002,
        identity: {name: 'Speaker', naturalId: 4},
      };

      expect(formatter.format(ref)).not.toMatch(/systemId|10000002/);
    });
  });
});
