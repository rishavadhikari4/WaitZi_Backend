import axios from "axios";
import khaltiConfig from "../config/khaltiConfig.js";

class KhaltiProvider {
  constructor() {
    this.gatewayUrl = khaltiConfig.gatewayUrl;
    this.secretKey = khaltiConfig.secretKey;
    this.returnUrl = khaltiConfig.returnUrl;
    this.websiteUrl = khaltiConfig.websiteUrl;
  }

  headers() {
    return {
      Authorization: `Key ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Initiate a Khalti payment
   * @param {number} paymentAmount - Amount in paisa (Rs * 100)
   * @param {string} transactionId - Unique purchase order ID (e.g., order._id)
   * @param {string} purchaseOrderName - Description (e.g., customer name + table)
   * @returns {{ pidx: string, payment_url: string, expires_at: string, expires_in: number }}
   */
  async initiatePayment(paymentAmount, transactionId, purchaseOrderName) {
    try {
      const details = {
        return_url: this.returnUrl,
        website_url: this.websiteUrl,
        amount: paymentAmount,
        purchase_order_id: transactionId,
        purchase_order_name: purchaseOrderName,
      };

      const response = await axios.post(
        `${this.gatewayUrl}/api/v2/epayment/initiate/`,
        details,
        { headers: this.headers() }
      );

      return response.data;
    } catch (error) {
      const msg = error?.response?.data || error.message;
      console.error("Error initializing Khalti payment:", msg);
      throw error;
    }
  }

  /**
   * Verify / Lookup a Khalti payment by pidx
   * @param {string} pidx - The payment identifier from Khalti
   * @returns {{ pidx, total_amount, status, transaction_id, ... }}
   */
  async verifyPayment(pidx) {
    if (!pidx) {
      throw new Error("pidx is required for payment verification.");
    }

    try {
      const response = await axios.post(
        `${this.gatewayUrl}/api/v2/epayment/lookup/`,
        { pidx },
        { headers: this.headers() }
      );

      return response.data;
    } catch (error) {
      const msg = error?.response?.data || error.message;
      console.error("Error verifying Khalti payment:", msg);
      throw error;
    }
  }
}

export default new KhaltiProvider();
