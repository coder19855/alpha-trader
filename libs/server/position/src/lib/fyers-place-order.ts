import { ResponseStatus, toErrorMessage } from '@alpha-trader/server-shared';

export interface FyersPlaceOrderOutcome {
  ok: boolean;
  orderId: string | null;
  error: string | null;
}

/** Normalize Fyers place_order resolve/reject payloads into a single outcome shape. */
export function parseFyersPlaceOrderOutcome(
  value: unknown,
): FyersPlaceOrderOutcome {
  if (value == null) {
    return { ok: false, orderId: null, error: 'Empty broker response' };
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const status = String(record.s ?? '').toLowerCase();
    const idRaw = record.id ?? record.order_id ?? record.orderId;
    const orderId =
      idRaw != null && String(idRaw).trim() ? String(idRaw).trim() : null;

    if (status === ResponseStatus.ok && orderId) {
      return { ok: true, orderId, error: null };
    }

    if (status === ResponseStatus.ok && !orderId) {
      return {
        ok: false,
        orderId: null,
        error: 'Broker accepted order but returned no order id',
      };
    }

    return {
      ok: false,
      orderId: null,
      error: toErrorMessage(value),
    };
  }

  return { ok: false, orderId: null, error: toErrorMessage(value) };
}

export function formatFyersPlaceOrderError(err: unknown): string {
  return toErrorMessage(err);
}