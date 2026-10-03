import { ApiError, messageOf } from './api/client';
import type { Errors } from './validation';

/** Moves keyboard focus to the first field that has an error (fields use their name as id). */
export function focusFirstError<K extends string>(order: readonly K[], errors: Errors<K>, idPrefix = ''): void {
  const first = order.find((field) => errors[field]);
  if (first) document.getElementById(idPrefix + first)?.focus();
}

/**
 * Splits a failed request into per-field messages (from a 400 VALIDATION_ERROR's details)
 * and one general message for everything else.
 */
export function splitServerError<K extends string>(err: unknown, fields: readonly K[]): { fieldErrors: Errors<K>; message: string } {
  const fieldErrors: Errors<K> = {};
  if (err instanceof ApiError) {
    for (const d of err.details) {
      if ((fields as readonly string[]).includes(d.field)) fieldErrors[d.field as K] = d.message;
    }
    const hasFieldErrors = Object.keys(fieldErrors).length > 0;
    return { fieldErrors, message: hasFieldErrors ? 'Please fix the highlighted fields.' : err.message };
  }
  return { fieldErrors, message: messageOf(err) };
}
