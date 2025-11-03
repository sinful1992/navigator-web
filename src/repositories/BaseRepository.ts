// src/repositories/BaseRepository.ts
// Base repository with common CRUD operations

import type { Operation } from '../sync/operations';

export interface SubmitOperationFn {
  (operation: Partial<Operation>): Promise<void>;
}

/**
 * BaseRepository - Abstract base for data access
 *
 * Responsibility: Data persistence and sync operations ONLY
 * - Submit operations to cloud
 * - Handle retries and errors
 * - No business logic (validations, calculations)
 */
export abstract class BaseRepository {
  protected submitOperation: SubmitOperationFn;
  protected deviceId: string;

  constructor(submitOperation: SubmitOperationFn, deviceId: string) {
    this.submitOperation = submitOperation;
    this.deviceId = deviceId;
  }

  /**
   * Submit operation to sync system
   */
  protected async submit(operation: Partial<Operation>): Promise<void> {
    await this.submitOperation(operation);
  }
}
