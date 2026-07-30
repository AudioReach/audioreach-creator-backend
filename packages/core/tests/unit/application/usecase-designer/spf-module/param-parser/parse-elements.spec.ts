/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {parseParameterData} from '../../../../../../src/application/usecase-designer/shared/parse-elements.js';
import type {
  ConfigElementData,
  ElementArrayData,
  StructData,
} from '../../../../../../src/domain/entities/definitions/common/types/element-data.js';
import {PARAMETER_ELEMENT_TYPE} from '../../../../../../src/application/usecase-designer/shared/element-definition.js';

describe('parseParameterData', () => {
  describe('ConfigElement', () => {
    it('parses UInt32 scalar', () => {
      const payload = new Uint8Array([0x05, 0x00, 0x00, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'gain',
          dataType: 'UInt32',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'gain',
        value: '5',
        isReadOnly: false,
      });
    });

    it('parses Int16 negative value', () => {
      const payload = new Uint8Array([0xff, 0xff]); // -1 as little-endian Int16
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'offset',
          dataType: 'Int16',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'offset',
        value: '-1',
      });
    });

    it('parses Float value', () => {
      const buf = new ArrayBuffer(4);
      new DataView(buf).setFloat32(0, 1.5, true);
      const payload = new Uint8Array(buf);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'freq',
          dataType: 'Float',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0].type).toBe(PARAMETER_ELEMENT_TYPE.ConfigElement);
      expect(parseFloat((result[0] as ConfigElementData).value)).toBeCloseTo(
        1.5,
      );
    });

    it('parses RawData', () => {
      const payload = new Uint8Array([0x01, 0x02, 0x03]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'raw',
          dataType: 'RawData',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'raw',
      });
    });

    it('generates name for template element with no name', () => {
      const payload = new Uint8Array([
        0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElementArray',
          name: 'filter_coeffs',
          arrayLength: 2,
          dataType: 'UInt32',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      const arr = result[0] as ElementArrayData;
      expect(arr.template[0].name).toBe('filter_coeffs');
      expect(arr.value[0].name).toBe('filter_coeffs[0]');
      expect(arr.value[1].name).toBe('filter_coeffs[1]');
    });
  });

  describe(PARAMETER_ELEMENT_TYPE.Struct, () => {
    it('parses flat struct with two children', () => {
      const payload = new Uint8Array([
        0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: PARAMETER_ELEMENT_TYPE.Struct,
          name: 'filter',
          isReadOnly: false,
          structureType: 'filter_t',
          elements: [
            {
              elementType: 'ConfigElement',
              name: 'freq',
              dataType: 'UInt32',
              isReadOnly: false,
            },
            {
              elementType: 'ConfigElement',
              name: 'gain',
              dataType: 'UInt32',
              isReadOnly: false,
            },
          ],
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.Struct,
        name: 'filter',
      });
      const s = result[0] as StructData;
      expect(s.value).toHaveLength(2);
      expect(s.value[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'freq',
        value: '1',
      });
    });

    it('parses nested struct', () => {
      const payload = new Uint8Array([0x0a, 0x00, 0x00, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: PARAMETER_ELEMENT_TYPE.Struct,
          name: 'outer',
          isReadOnly: false,
          structureType: 'outer_t',
          elements: [
            {
              elementType: PARAMETER_ELEMENT_TYPE.Struct,
              name: 'inner',
              isReadOnly: false,
              structureType: 'inner_t',
              elements: [
                {
                  elementType: 'ConfigElement',
                  name: 'val',
                  dataType: 'UInt32',
                  isReadOnly: false,
                },
              ],
            },
          ],
        },
      ]);
      const result = parseParameterData(payload, structure);
      const outer = result[0] as StructData;
      const inner = outer.value[0] as StructData;
      expect(inner.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      expect((inner.value[0] as ConfigElementData).value).toBe('10');
    });
  });

  describe('ElementArray', () => {
    it('parses static-length array of UInt16', () => {
      const payload = new Uint8Array([0x01, 0x00, 0x02, 0x00, 0x03, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElementArray',
          name: 'coeff',
          arrayLength: 3,
          dataType: 'UInt16',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ElementArray,
        name: 'coeff',
        length: 3,
      });
      const arr = result[0] as ElementArrayData;
      expect(arr.value).toHaveLength(3);
      expect((arr.value[0] as ConfigElementData).value).toBe('1');
    });

    it('parses array of structs', () => {
      const payload = new Uint8Array([0x0a, 0x14]);
      const structure = JSON.stringify([
        {
          elementType: 'StructArray',
          name: 'bands',
          arrayLength: 2,
          keyStructureDefinition: {
            structureType: 'band_t',
            children: [
              {
                elementType: 'ConfigElement',
                name: 'val',
                dataType: 'UInt8',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = parseParameterData(payload, structure);
      const arr = result[0] as ElementArrayData;
      expect(arr.value[0].type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
    });

    it('resolves formula-driven array length from sibling ConfigElement inside a Struct', () => {
      // Struct layout:
      //   num_filters: UInt16 = 2  →  bytes [0x02, 0x00]
      //   filters[0]:  UInt16 = 10 →  bytes [0x0a, 0x00]
      //   filters[1]:  UInt16 = 20 →  bytes [0x14, 0x00]
      const payload = new Uint8Array([0x02, 0x00, 0x0a, 0x00, 0x14, 0x00]);
      const structure = JSON.stringify([
        {
          elementType: 'Struct',
          name: 'my_struct',
          structureType: 'my_struct_t',
          elements: [
            {
              elementType: 'ConfigElement',
              name: 'num_filters',
              dataType: 'UInt16',
              isReadOnly: false,
            },
            {
              elementType: 'ConfigElementArray',
              name: 'filters',
              arrayLenFormulaStr: 'num_filters',
              dataType: 'UInt16',
              isReadOnly: false,
            },
          ],
        },
      ]);
      const result = parseParameterData(payload, structure);
      const s = result[0] as StructData;
      expect(s.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      expect(s.name).toBe('my_struct');
      const arr = s.value[1] as ElementArrayData;
      expect(arr.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(arr.length).toBe(2);
      expect(arr.value).toHaveLength(2);
      expect((arr.value[0] as ConfigElementData).value).toBe('10');
      expect((arr.value[1] as ConfigElementData).value).toBe('20');
    });

    it('resolves nested formula-driven array lengths across two levels', () => {
      // Top-level: num_bands=2 drives outer array length
      // Per-struct: num_coeffs drives inner array length (2 for band[0], 3 for band[1])
      //
      // Payload layout (all UInt16 little-endian):
      //   num_bands=2:          [0x02, 0x00]
      //   band[0].num_coeffs=2: [0x02, 0x00]
      //   band[0].coeffs[0]=10: [0x0a, 0x00]
      //   band[0].coeffs[1]=20: [0x14, 0x00]
      //   band[1].num_coeffs=3: [0x03, 0x00]
      //   band[1].coeffs[0]=30: [0x1e, 0x00]
      //   band[1].coeffs[1]=40: [0x28, 0x00]
      //   band[1].coeffs[2]=50: [0x32, 0x00]
      const payload = new Uint8Array([
        0x02, 0x00, 0x02, 0x00, 0x0a, 0x00, 0x14, 0x00, 0x03, 0x00, 0x1e, 0x00,
        0x28, 0x00, 0x32, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'num_bands',
          dataType: 'UInt16',
          isReadOnly: false,
        },
        {
          elementType: 'StructArray',
          name: 'bands',
          arrayLenFormulaStr: 'num_bands',
          keyStructureDefinition: {
            structureType: 'band_t',
            children: [
              {
                elementType: 'ConfigElement',
                name: 'num_coeffs',
                dataType: 'UInt16',
                isReadOnly: false,
              },
              {
                elementType: 'ConfigElementArray',
                name: 'coeffs',
                arrayLenFormulaStr: 'num_coeffs',
                dataType: 'UInt16',
                isReadOnly: false,
              },
            ],
          },
        },
      ]);
      const result = parseParameterData(payload, structure);
      // result[0] = ConfigElementData(num_bands, value='2')
      // result[1] = ElementArrayData(bands, length=2)
      expect(result).toHaveLength(2);
      const bands = result[1] as ElementArrayData;
      expect(bands.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(bands.length).toBe(2);
      expect(bands.value).toHaveLength(2);

      // band[0]: num_coeffs=2, coeffs=[10, 20]
      const band0 = bands.value[0] as StructData;
      expect(band0.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      const coeffs0 = band0.value[1] as ElementArrayData;
      expect(coeffs0.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(coeffs0.length).toBe(2);
      expect(coeffs0.value).toHaveLength(2);
      expect((coeffs0.value[0] as ConfigElementData).value).toBe('10');
      expect((coeffs0.value[1] as ConfigElementData).value).toBe('20');

      // band[1]: num_coeffs=3, coeffs=[30, 40, 50]
      const band1 = bands.value[1] as StructData;
      expect(band1.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      const coeffs1 = band1.value[1] as ElementArrayData;
      expect(coeffs1.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(coeffs1.length).toBe(3);
      expect(coeffs1.value).toHaveLength(3);
      expect((coeffs1.value[0] as ConfigElementData).value).toBe('30');
      expect((coeffs1.value[1] as ConfigElementData).value).toBe('40');
      expect((coeffs1.value[2] as ConfigElementData).value).toBe('50');
    });

    it('resolves formula-driven array length from previously parsed element', () => {
      const payload = new Uint8Array([
        0x03, 0x00, 0x01, 0x00, 0x02, 0x00, 0x03, 0x00,
      ]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'count',
          dataType: 'UInt16',
          isReadOnly: false,
        },
        {
          elementType: 'ConfigElementArray',
          name: 'data',
          arrayLenFormulaStr: 'count',
          dataType: 'UInt16',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      const arr = result[1] as ElementArrayData;
      expect(arr.length).toBe(3);
      expect(arr.value).toHaveLength(3);
    });
  });

  describe('StructArray', () => {
    it('parses complex MBDRC structure with dynamic StructArray and nested StructArray', () => {
      // Payload: binary data for MBDRC parameter (num_bands=5, num_config=1)
      // Layout: 5 scalars | drc_delay[5] | config_data[0]{channel_mask_lsb, channel_mask_msb,
      //         limiter{9 fields}, subband_drc[5]{21 fields each}, iir_filter[4]{3 fields each},
      //         mute_flag[5]}
      // The formula evaluator strips namespace prefixes (e.g. "iir_mbdrc_config_params_t::num_bands"
      // becomes "num_bands"), so nested StructArray lengths resolve correctly from top-level scalars.
      const hexStr =
        '050000000100000020000000440B00000100000060000000600000006000000060000000600000000E0000000000000000D0A905B5000000B87E000020000000B85453003AE70D000080000000800000AF34210701000100010064000010000008F7A74909061E00E2014B00000000F627000000E6030F00E6030F00A74927239999A74900F8BB05E6030F0001000100010064000010000008F7A74909061E00E2014B00000000F627000000ED64E602E6030F00A7492728AAAAA74900F8BB05E6030F0001000100010064000010000008F7A74909061E00E2014B00000000F62700000000F8BB05E6030F00A749E7280080A74900F8BB05E6030F0001000100010064000010000008F7A74909061E00E2014B00000000F62700000000F8BB05E6030F00A749E7280080A74900F8BB05E6030F0001000100010064000010000008F7A74909061E00E2014B00000000F62700000000F8BB05E6030F00A749E7280080A74900F8BB05E6030F000300000002000000DC773F079D90CCF007BCDB07C5C730F029D99AF8000000007DE5F506EDE815F17389900700BF7BF00300000002000000834191064EA89CF1C152B8070D3979F0C0D72AF900000000CA9C0D061DAE1EF2FA9C2707BB2608F10300000002000000B3BA6505352242F39DC9740716DF4CF17A0A30FA000000004DF18F04F5740DF42A8069068E134BF20300000002000000E66D2C04D41775F537622307BFD1E3F2309661FB000000007CF51603B46365F6F2479405CC733DF40000000000000000000000000000000000000000';

      const payload = new Uint8Array(
        hexStr.match(/.{2}/g)!.map(b => parseInt(b, 16)),
      );

      const paramStructure =
        '[{"elementType":"ConfigElement","name":"num_bands","description":"Number of bands.","defaultValue":"1","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5},{"elementType":"ConfigElement","name":"limiter_mode","description":"Specifies whether Limiter mode is bypassed for subbands.","defaultValue":"1","dataType":"UInt32","displayType":"DropDown","policy":"Advanced","isReadOnly":false,"precision":5},{"elementType":"ConfigElement","name":"limiter_delay","description":"Limiter delay in samples.","defaultValue":"262","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"15","precision":5},{"elementType":"ConfigElement","name":"limiter_history_winlen","description":"Length of history window","defaultValue":"2884","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"15","precision":5},{"elementType":"ConfigElement","name":"num_config","description":"Specifies the different sets of mbdrc configurations.","defaultValue":"1","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5},{"elementType":"ConfigElementArray","name":"drc_delay","description":"DRC delay in samples.","groupSet":0,"displayType":"TextBox","policy":"Advanced","isReadOnly":false,"arrayLength":0,"arrayLenFormulaStr":"num_bands","dataType":"UInt32"},{"elementType":"StructArray","name":"config_data","description":"Specifies the different sets of mbdrc configurations","keyStructureDefinition":{"structureType":"iir_mbdrc_per_ch_config_params_t","children":[{"defaultValue":"4294967294","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5,"elementType":"ConfigElement","name":"channel_mask_lsb","description":"Lower 32 bits of the channel mask."},{"defaultValue":"4294967295","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5,"elementType":"ConfigElement","name":"channel_mask_msb","description":"Upper 32 bits of the channel mask."},{"structureType":"limiter_config_param_t","children":[{"defaultValue":"93945856","dataType":"Int32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"27","precision":5,"elementType":"ConfigElement","name":"limiter_threshold","description":"Threshold in decibels for the limiter output."},{"defaultValue":"256","dataType":"Int32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"8","precision":5,"elementType":"ConfigElement","name":"limiter_makeup_gain","description":"Makeup gain in decibels for the limiter output."},{"defaultValue":"32440","dataType":"Int32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"15","precision":5,"elementType":"ConfigElement","name":"limiter_gc","description":"Limiter gain recovery coefficient."},{"defaultValue":"82","dataType":"Int32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"15","precision":5,"elementType":"ConfigElement","name":"limiter_max_wait","description":"Maximum limiter waiting time in samples."},{"defaultValue":"188099735","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"gain_attack","description":"Limiter gain attack time"},{"defaultValue":"32559427","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"gain_release","description":"Limiter gain release time"},{"defaultValue":"32768","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"15","precision":5,"elementType":"ConfigElement","name":"attack_coef","description":"Limiter gain attack time speed coef"},{"defaultValue":"32768","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"15","precision":5,"elementType":"ConfigElement","name":"release_coef","description":"Limiter gain release time speed coef"},{"defaultValue":"93945856","dataType":"Int32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"27","precision":5,"elementType":"ConfigElement","name":"hard_threshold","description":"Hard Threshold in decibels for the limiter output."}],"elementType":"Struct","name":"limiter","description":"..."},{"keyStructureDefinition":{"structureType":"subband_drc_config_params_t","children":[{"defaultValue":"1","dataType":"Int16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5,"elementType":"ConfigElement","name":"drc_mode","description":"Specifies whether DRC mode is bypassed for subbands."},{"defaultValue":"1","dataType":"Int16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5,"elementType":"ConfigElement","name":"drc_linked_flag","description":"Specifies whether all stereo channels have the same applied dynamics."},{"defaultValue":"1","dataType":"Int16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5,"elementType":"ConfigElement","name":"drc_down_sample_level","description":"DRC down sample level."},{"defaultValue":"298","dataType":"UInt16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"16","precision":5,"elementType":"ConfigElement","name":"drc_rms_time_avg_const","description":"RMS signal energy time-averaging constant."},{"defaultValue":"4096","dataType":"UInt16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"12","precision":5,"elementType":"ConfigElement","name":"drc_makeup_gain","description":"DRC makeup gain in decibels."},{"defaultValue":"3877","dataType":"Int16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"7","precision":5,"elementType":"ConfigElement","name":"down_expdr_threshold","description":"Down expander threshold."},{"defaultValue":"-102","dataType":"Int16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"8","precision":5,"elementType":"ConfigElement","name":"down_expdr_slope","description":"Down expander slope."},{"defaultValue":"18855","dataType":"UInt16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"14","precision":5,"elementType":"ConfigElement","name":"down_expdr_hysteresis","description":"Down expander hysteresis constant."},{"defaultValue":"15690611","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"down_expdr_attack","description":"Down expander attack constant."},{"defaultValue":"39011832","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"down_expdr_release","description":"Down expander release constant."},{"defaultValue":"-50331648","dataType":"Int32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"23","precision":5,"elementType":"ConfigElement","name":"down_expdr_min_gain_db","description":"Down expander minimum gain."},{"defaultValue":"3877","dataType":"Int16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"7","precision":5,"elementType":"ConfigElement","name":"up_cmpsr_threshold","description":"Up compressor threshold."},{"defaultValue":"0","dataType":"UInt16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"8","precision":5,"elementType":"ConfigElement","name":"up_cmpsr_slope","description":"Up compressor slope."},{"defaultValue":"7859688","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"up_cmpsr_attack","description":"Up compressor attack constant."},{"defaultValue":"7859688","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"up_cmpsr_release","description":"Up compressor release constant."},{"defaultValue":"18855","dataType":"UInt16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"14","precision":5,"elementType":"ConfigElement","name":"up_cmpsr_hysteresis","description":"Up compressor hysteresis constant."},{"defaultValue":"9637","dataType":"Int16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"7","precision":5,"elementType":"ConfigElement","name":"down_cmpsr_threshold","description":"Down compressor threshold."},{"defaultValue":"62259","dataType":"UInt16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"8","precision":5,"elementType":"ConfigElement","name":"down_cmpsr_slope","description":"Down compressor slope."},{"defaultValue":"18855","dataType":"UInt16","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"14","precision":5,"elementType":"ConfigElement","name":"down_cmpsr_hysteresis","description":"Down compressor hysteresis constant."},{"defaultValue":"77314964","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"down_cmpsr_attack","description":"Down compressor attack constant."},{"defaultValue":"1574244","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"qFormat":"31","precision":5,"elementType":"ConfigElement","name":"down_cmpsr_release","description":"Down compressor release constant."}],"elementType":"Struct","name":"subband_drc","description":"..."},"arrayLength":0,"arrayLenFormulaStr":"iir_mbdrc_config_params_t::num_bands","elementType":"StructArray","name":"subband_drc","description":"..."},{"keyStructureDefinition":{"structureType":"iir_filter_config_params_t","children":[{"defaultValue":"3","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5,"elementType":"ConfigElement","name":"num_even_stages","description":"even filter stages;"},{"defaultValue":"2","dataType":"UInt32","displayType":"TextBox","policy":"Advanced","isReadOnly":false,"precision":5,"elementType":"ConfigElement","name":"num_odd_stages","description":"odd filter stages"},{"displayType":"TextBox","policy":"Advanced","isReadOnly":false,"arrayLength":10,"elementType":"ConfigElementArray","name":"iir_coeffs","description":"IIR filter coefficients.","dataType":"UInt32"}],"elementType":"Struct","name":"iir_filter","description":"..."},"arrayLength":0,"arrayLenFormulaStr":"(iir_mbdrc_config_params_t::num_bands)- 1","elementType":"StructArray","name":"iir_filter","description":"..."},{"displayType":"TextBox","policy":"Advanced","isReadOnly":false,"arrayLength":0,"arrayLenFormulaStr":"iir_mbdrc_config_params_t::num_bands","elementType":"ConfigElementArray","name":"mute_flag","description":"...","groupSet":0,"dataType":"UInt32"}],"elementType":"Struct","name":"config_data","description":"Specifies the different sets of mbdrc configurations"},"arrayLength":0,"arrayLenFormulaStr":"num_config"}]';
      const result = parseParameterData(payload, paramStructure);

      // ── Top-level: 7 elements (5 scalars + drc_delay array + config_data struct-array) ──
      expect(result).toHaveLength(7);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'num_bands',
        value: '5',
      });
      expect(result[1]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'limiter_mode',
        value: '1',
      });
      expect(result[2]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'limiter_delay',
        value: '32',
      });
      expect(result[3]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'limiter_history_winlen',
        value: '2884',
      });
      expect(result[4]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'num_config',
        value: '1',
      });

      // ── drc_delay: ConfigElementArray driven by num_bands=5 ──
      const drcDelay = result[5] as ElementArrayData;
      expect(drcDelay).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ElementArray,
        name: 'drc_delay',
        length: 5,
      });
      expect(drcDelay.value).toHaveLength(5);
      // All drc_delay values are 96 (0x60000000 little-endian)
      expect((drcDelay.value[0] as ConfigElementData).value).toBe('96');
      expect((drcDelay.value[4] as ConfigElementData).value).toBe('96');

      // ── config_data: StructArray driven by num_config=1 ──
      const configData = result[6] as ElementArrayData;
      expect(configData).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ElementArray,
        name: 'config_data',
        length: 1,
      });
      expect(configData.value).toHaveLength(1);

      // ── config_data[0]: Struct with 6 children ──
      const configData0 = configData.value[0] as StructData;
      expect(configData0.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      expect(configData0.value).toHaveLength(6);

      // channel_mask_lsb=14, channel_mask_msb=0
      expect((configData0.value[0] as ConfigElementData).value).toBe('14');
      expect((configData0.value[1] as ConfigElementData).value).toBe('0');

      // ── limiter: nested Struct with 9 scalar children ──
      const limiter = configData0.value[2] as StructData;
      expect(limiter.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      expect(limiter.name).toBe('limiter');
      expect(limiter.value).toHaveLength(9);
      // limiter_threshold = 0x05A9D000 = 95014912 (Int32 little-endian)
      expect((limiter.value[0] as ConfigElementData).value).toBe('95014912');
      // attack_coef = release_coef = 32768 (0x00008000)
      expect((limiter.value[6] as ConfigElementData).value).toBe('32768');
      expect((limiter.value[7] as ConfigElementData).value).toBe('32768');

      // ── subband_drc: StructArray; length driven by "iir_mbdrc_config_params_t::num_bands"
      //    The formula evaluator strips the namespace prefix → resolves to num_bands=5 ──
      const subbandDrc = configData0.value[3] as ElementArrayData;
      expect(subbandDrc.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(subbandDrc.name).toBe('subband_drc');
      expect(subbandDrc.length).toBe(5);
      expect(subbandDrc.value).toHaveLength(5);

      // subband_drc[0]: Struct with 21 scalar children; drc_mode=1
      const subbandDrc0 = subbandDrc.value[0] as StructData;
      expect(subbandDrc0.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      expect(subbandDrc0.value).toHaveLength(21);
      expect((subbandDrc0.value[0] as ConfigElementData).value).toBe('1'); // drc_mode

      // ── iir_filter: StructArray; length driven by "(iir_mbdrc_config_params_t::num_bands)- 1"
      //    → resolves to num_bands-1 = 4 ──
      const iirFilter = configData0.value[4] as ElementArrayData;
      expect(iirFilter.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(iirFilter.name).toBe('iir_filter');
      expect(iirFilter.length).toBe(4);
      expect(iirFilter.value).toHaveLength(4);

      // iir_filter[0]: Struct with 3 children (num_even_stages, num_odd_stages, iir_coeffs)
      const iirFilter0 = iirFilter.value[0] as StructData;
      expect(iirFilter0.type).toBe(PARAMETER_ELEMENT_TYPE.Struct);
      expect(iirFilter0.value).toHaveLength(3);

      // iir_coeffs: ConfigElementArray with fixed arrayLength=10
      const iirCoeffs = iirFilter0.value[2] as ElementArrayData;
      expect(iirCoeffs.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(iirCoeffs.name).toBe('iir_coeffs');
      expect(iirCoeffs.length).toBe(10);
      expect(iirCoeffs.value).toHaveLength(10);

      // ── mute_flag: ConfigElementArray driven by num_bands=5 ──
      const muteFlag = configData0.value[5] as ElementArrayData;
      expect(muteFlag.type).toBe(PARAMETER_ELEMENT_TYPE.ElementArray);
      expect(muteFlag.name).toBe('mute_flag');
      expect(muteFlag.length).toBe(5);
      expect(muteFlag.value).toHaveLength(5);
    });
  });

  describe('error fallback', () => {
    it('returns _raw on buffer overflow', () => {
      const payload = new Uint8Array([0x01, 0x00]); // only 2 bytes, needs 4
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'gain',
          dataType: 'UInt32',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'Failed to parse payload',
        dataType: 'RawData',
        isReadOnly: true,
        value: '0100',
      });
    });

    it('returns _raw on malformed JSON', () => {
      const payload = new Uint8Array([0x01, 0x00, 0x00, 0x00]);
      const result = parseParameterData(payload, 'not valid json');
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'Failed to parse payload',
        dataType: 'RawData',
        isReadOnly: true,
        value: '01000000',
      });
    });

    it('returns _raw on empty payload with non-empty schema', () => {
      const payload = new Uint8Array([]);
      const structure = JSON.stringify([
        {
          elementType: 'ConfigElement',
          name: 'gain',
          dataType: 'UInt32',
          isReadOnly: false,
        },
      ]);
      const result = parseParameterData(payload, structure);
      expect(result[0]).toMatchObject({
        type: PARAMETER_ELEMENT_TYPE.ConfigElement,
        name: 'Failed to parse payload',
        dataType: 'RawData',
        isReadOnly: true,
        value: '',
      });
    });
  });
});
