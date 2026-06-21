/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * Abstract base class for all response DTOs.
 * Subclasses must declare `systemId` with their own @ApiProperty description.
 */
export abstract class BaseDto {
  /**
   * Subclasses must override this property and provide their own
   * @ApiProperty({ description: '...' }) decorator.
   */
  abstract systemId: string;
}
