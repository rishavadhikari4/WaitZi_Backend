import Order from '../models/Order.js';
import Table from '../models/Table.js';

class OrderTimeoutManager {
  constructor() {
    this.timeouts = new Map(); // Store active timeouts
    this.defaultTimeout = 30 * 60 * 1000; // 30 minutes in milliseconds
  }

  // Set timeout for an order
  setOrderTimeout(orderId, timeoutMinutes = 30) {
    // Clear existing timeout if any
    this.clearOrderTimeout(orderId);

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const timeoutId = setTimeout(async () => {
      await this.handleOrderTimeout(orderId);
      this.timeouts.delete(orderId);
    }, timeoutMs);

    this.timeouts.set(orderId, timeoutId);
    console.log(`⏰ Timeout set for order ${orderId} - ${timeoutMinutes} minutes`);
  }

  // Clear timeout for an order (when order is paid/cancelled)
  clearOrderTimeout(orderId) {
    const existingTimeout = this.timeouts.get(orderId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.timeouts.delete(orderId);
      console.log(`✅ Timeout cleared for order ${orderId}`);
    }
  }

  // Handle order timeout
  async handleOrderTimeout(orderId) {
    try {
      console.log(`⏰ Processing timeout for order ${orderId}`);
      
      const order = await Order.findById(orderId);
      if (!order) {
        console.log(`Order ${orderId} not found during timeout`);
        return;
      }

      // Only timeout orders that are still pending/in-kitchen
      if (!['Pending', 'InKitchen'].includes(order.status)) {
        console.log(`Order ${orderId} already processed (${order.status}), skipping timeout`);
        return;
      }

      // Mark order as timed out and cancelled
      await Order.findByIdAndUpdate(orderId, {
        status: 'Cancelled',
        isTimedOut: true,
        note: (order.note || '') + ' [AUTO-CANCELLED: Order timed out]'
      });

      // Clear table and make it available
      await Table.findByIdAndUpdate(order.table, {
        status: 'Available',
        currentOrder: null
      });

      console.log(`❌ Order ${orderId} timed out and cancelled after 30 minutes`);
      
      // You could add notification here (email, SMS, etc.)
      
    } catch (error) {
      console.error(`Error handling timeout for order ${orderId}:`, error.message);
    }
  }

  // Clean up all timeouts on server shutdown
  cleanup() {
    console.log('🧹 Cleaning up order timeouts...');
    for (const [orderId, timeoutId] of this.timeouts.entries()) {
      clearTimeout(timeoutId);
    }
    this.timeouts.clear();
  }

  // Get active timeouts (for monitoring)
  getActiveTimeouts() {
    return Array.from(this.timeouts.keys());
  }

  // Restore timeouts on server restart
  async restoreTimeouts() {
    try {
      console.log('🔄 Restoring order timeouts...');
      
      // Find all pending orders that should have timeouts
      const pendingOrders = await Order.find({
        status: { $in: ['Pending', 'InKitchen'] },
        isTimedOut: false
      }).select('_id orderTimeout createdAt');

      let restoredCount = 0;
      
      for (const order of pendingOrders) {
        const now = new Date();
        const timeoutTime = new Date(order.orderTimeout);
        
        if (timeoutTime > now) {
          // Order still has time left
          const remainingMs = timeoutTime.getTime() - now.getTime();
          const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
          
          this.setOrderTimeout(order._id.toString(), remainingMinutes);
          restoredCount++;
        } else {
          // Order should have already timed out
          await this.handleOrderTimeout(order._id.toString());
        }
      }
      
      console.log(`✅ Restored ${restoredCount} order timeouts`);
      
    } catch (error) {
      console.error('Error restoring order timeouts:', error.message);
    }
  }
}

// Create singleton instance
const orderTimeoutManager = new OrderTimeoutManager();

// Export for use in controllers
export default orderTimeoutManager;

// Helper function to set timeout when order is created
export const setNewOrderTimeout = (orderId, timeoutMinutes = 30) => {
  orderTimeoutManager.setOrderTimeout(orderId, timeoutMinutes);
};

// Helper function to clear timeout when order is completed/cancelled
export const clearOrderTimeout = (orderId) => {
  orderTimeoutManager.clearOrderTimeout(orderId);
};

// For server initialization
export const initializeTimeoutManager = async () => {
  await orderTimeoutManager.restoreTimeouts();
};

// For graceful shutdown
export const cleanupTimeouts = () => {
  orderTimeoutManager.cleanup();
};