/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const PROPERTY_TYPE = {
  Spf: 'Spf',
  Driver: 'Driver',
  Container: 'Container',
  Module: 'Module',
  ControlLink: 'ControlLink',
} as const;

export type PROPERTY_TYPE = (typeof PROPERTY_TYPE)[keyof typeof PROPERTY_TYPE];

export const SharedType = {
  None: 'None',
  Exported: 'Exported',
  Imported: 'Imported',
} as const;

export type SharedType = (typeof SharedType)[keyof typeof SharedType];

export const CONN_CTRL_TYPE = {
  MODULE_MODULE: 'MODULE_MODULE',
  MODULE_SUBSYSTEM: 'MODULE_SUBSYSTEM',
  SUBSYSTEM_MODULE: 'SUBSYSTEM_MODULE',
  SUBSYSTEM_SUBSYSTEM: 'SUBSYSTEM_SUBSYSTEM',
} as const;

export type CONN_CTRL_TYPE =
  (typeof CONN_CTRL_TYPE)[keyof typeof CONN_CTRL_TYPE];

export const ModificationAction = {
  None: 'None',
  Add: 'Add',
  Delete: 'Delete',
  Update: 'Update',
} as const;

export type ModificationAction =
  (typeof ModificationAction)[keyof typeof ModificationAction];

export enum AsyncResult {
  Completed = 'Completed',
  Cancelled = 'Cancelled',
  Timeout = 'Timeout',
}

export enum ErrorCode {
  /**
   * No Errors are present. Operation is successful
   */
  None = 'None',
  Warning = 'Warning',
  GeneralFailure = 'GeneralFailure',
  InvalidInput = 'InvalidInput',
  /**
   * The definition of a component is invalid for an operation
   */
  InvalidDefinition = 'InvalidDefinition',
  InvalidOperation = 'InvalidOperation',
  DataAlreadyExists = 'DataAlreadyExists',
  DataNotFound = 'DataNotFound',
  ValidationIssues = 'ValidationIssues',
  TimeOut = 'TimeOut',
  Locked = 'Locked', // The resource that is being accessed is locked
  ServiceUnavailable = 'ServiceUnavailable',
  OperationCancelled = 'OperationCancelled',
  /**
   * The resource does not have enough space to store data
   */
  InsufficientStorage = 'InsufficientStorage',
  ExceedsLimit = 'ExceedsLimit',
  /**
   * The action being peformed or the component provided is not supported
   */
  Unsupported = 'Unsupported',
}
