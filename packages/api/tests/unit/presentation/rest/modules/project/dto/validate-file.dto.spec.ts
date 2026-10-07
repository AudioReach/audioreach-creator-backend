/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {plainToInstance} from 'class-transformer';
import {validate} from 'class-validator';
import {VALIDATION_RULE_GROUP} from '@arc/core';
import {ValidateFileRequestDto} from '../../../../../../../src/presentation/rest/modules/project/dto/validate-file.dto.js';

async function errorsFor(plain: object) {
  return validate(plainToInstance(ValidateFileRequestDto, plain));
}

describe('ValidateFileRequestDto', () => {
  it('accepts an empty body because group is optional', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each(Object.values(VALIDATION_RULE_GROUP))(
    'accepts the core group %s',
    async group => {
      expect(await errorsFor({group})).toHaveLength(0);
    },
  );

  it('rejects a group that is not defined in core', async () => {
    const errors = await errorsFor({group: 'NOPE'});
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('group');
  });
});
