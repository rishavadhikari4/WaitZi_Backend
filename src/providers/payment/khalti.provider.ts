// src/providers/payment/khalti.provider.ts
// Khalti ePayment v2. Credentials are passed in (not read from env) so Stage 4
// can hand each organization its own merchant keys.
import axios from 'axios';

import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

export interface KhaltiCredentials {
  gatewayUrl: string;
  secretKey: string;
}

export interface KhaltiInitiateResult {
  pidx: string;
  payment_url: string;
  expires_at: string;
  expires_in: number;
}

export interface KhaltiLookupResult {
  pidx: string;
  /** Paisa. */
  total_amount: number;
  status: 'Completed' | 'Pending' | 'Initiated' | 'Refunded' | 'Expired' | 'User canceled' | 'Partially Refunded';
  transaction_id: string | null;
}

export class KhaltiProvider {
  constructor(private readonly creds: KhaltiCredentials) {}

  private headers() {
    return { Authorization: `Key ${this.creds.secretKey}`, 'Content-Type': 'application/json' };
  }

  async initiate(args: {
    amountPaisa: number;
    purchaseOrderId: string;
    purchaseOrderName: string;
    returnUrl: string;
    websiteUrl: string;
  }): Promise<KhaltiInitiateResult> {
    try {
      const { data } = await axios.post<KhaltiInitiateResult>(
        `${this.creds.gatewayUrl}/api/v2/epayment/initiate/`,
        {
          return_url: args.returnUrl,
          website_url: args.websiteUrl,
          amount: args.amountPaisa,
          purchase_order_id: args.purchaseOrderId,
          purchase_order_name: args.purchaseOrderName,
        },
        { headers: this.headers(), timeout: 15_000 },
      );
      return data;
    } catch (error) {
      logger.error('Khalti initiate failed', { detail: axios.isAxiosError(error) ? error.response?.data : String(error) });
      throw new AppError('Could not start the Khalti payment. Please try again.', 502, 'KHALTI_UNAVAILABLE');
    }
  }

  /** Server-to-server status check; the redirect's own query string is never trusted. */
  async lookup(pidx: string): Promise<KhaltiLookupResult> {
    try {
      const { data } = await axios.post<KhaltiLookupResult>(
        `${this.creds.gatewayUrl}/api/v2/epayment/lookup/`,
        { pidx },
        { headers: this.headers(), timeout: 15_000 },
      );
      return data;
    } catch (error) {
      logger.error('Khalti lookup failed', { pidx, detail: axios.isAxiosError(error) ? error.response?.data : String(error) });
      throw new AppError('Could not verify the Khalti payment', 502, 'KHALTI_UNAVAILABLE');
    }
  }
}
