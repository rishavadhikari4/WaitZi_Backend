import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import Table from "../models/Table.js";
import User from "../models/User.js";
import { clearOrderTimeout } from '../utils/orderTimeoutManager.js';

class PaymentController {
  constructor() {
    this.defaultPaginationLimit = 20;
    this.maxPaginationLimit = 100;
    this.validSortFields = ['paymentTime', 'amount', 'createdAt', 'updatedAt'];
    this.validPaymentMethods = ['Cash', 'Card', 'Fonepay', 'NepalPay'];
    this.validPaymentStatuses = ['Paid', 'Pending', 'Failed', 'Refunded'];
  }

  // Process payment for an order
  async processPayment(req, res) {
    try {
      const { orderId, paymentMethod, amount, transactionId, handledBy } = req.body;

      // Validate required fields
      if (!orderId || !paymentMethod || !amount) {
        return res.status(400).json({
          success: false,
          message: "Order ID, payment method, and amount are required"
        });
      }

      if (!this.isValidObjectId(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format"
        });
      }

      // Validate payment method
      if (!this.validPaymentMethods.includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment method. Must be one of: ${this.validPaymentMethods.join(', ')}`
        });
      }

      // Validate amount
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Amount must be a positive number"
        });
      }

      // Check if order exists and is ready for payment
      const order = await Order.findById(orderId).populate('table');
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      if (!['Served', 'Pending', 'InKitchen'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: `Cannot process payment for ${order.status.toLowerCase()} order`
        });
      }

      // Check if payment already exists for this order
      const existingPayment = await Payment.findOne({ 
        order: orderId, 
        paymentStatus: { $in: ['Paid', 'Pending'] }
      });

      if (existingPayment) {
        return res.status(409).json({
          success: false,
          message: "Payment already exists for this order",
          data: existingPayment
        });
      }

      // Validate amount matches order final amount (with some tolerance for rounding)
      const amountDifference = Math.abs(numAmount - order.finalAmount);
      if (amountDifference > 0.01) {
        return res.status(400).json({
          success: false,
          message: `Payment amount (${numAmount}) does not match order total (${order.finalAmount})`
        });
      }

      // Validate staff member if provided
      if (handledBy) {
        const staff = await User.findById(handledBy);
        if (!staff) {
          return res.status(400).json({
            success: false,
            message: "Invalid staff ID"
          });
        }
      }

      // Create payment record
      const paymentData = {
        order: orderId,
        table: order.table._id,
        amount: numAmount,
        paymentMethod,
        paymentStatus: paymentMethod === 'Cash' ? 'Paid' : 'Pending', // Cash is immediately paid
        handledBy: handledBy || null,
        transactionId: transactionId?.trim() || null,
        paymentTime: new Date()
      };

      const newPayment = new Payment(paymentData);
      const savedPayment = await newPayment.save();

      // Update order status to paid if payment is successful
      if (paymentData.paymentStatus === 'Paid') {
        await Order.findByIdAndUpdate(orderId, { status: 'Paid' });
        
        // Clear timeout since payment is completed
        clearOrderTimeout(orderId);
        
        // Clear table
        await Table.findByIdAndUpdate(order.table._id, {
          status: 'Available',
          currentOrder: null
        });
      }

      // Populate the saved payment for response
      const populatedPayment = await Payment.findById(savedPayment._id)
        .populate('order', 'customerName totalAmount finalAmount status items')
        .populate('table', 'tableNumber capacity')
        .populate('handledBy', 'firstName lastName')
        .lean();

      console.log(`✅ Payment processed for order ${orderId}, method: ${paymentMethod}, amount: ${numAmount}`);

      res.status(201).json({
        success: true,
        message: "Payment processed successfully",
        data: populatedPayment
      });

    } catch (error) {
      this.handleError(error, res, 'Error processing payment');
    }
  }

  // Get all payments with filtering and pagination
  async getAllPayments(req, res) {
    try {
      const queryParams = this.parseQueryParameters(req.query);
      const filter = this.buildFilter(queryParams);
      const sort = this.buildSort(queryParams.sortBy, queryParams.sortOrder);

      const [payments, totalPayments] = await Promise.all([
        Payment.find(filter)
          .populate('order', 'customerName totalAmount finalAmount status')
          .populate('table', 'tableNumber capacity')
          .populate('handledBy', 'firstName lastName')
          .sort(sort)
          .skip((queryParams.pageNum - 1) * queryParams.limitNum)
          .limit(queryParams.limitNum)
          .lean(),
        Payment.countDocuments(filter)
      ]);

      const paginationMeta = this.buildPaginationMetadata(
        queryParams.pageNum,
        queryParams.limitNum,
        totalPayments
      );

      // Add payment statistics
      const paymentStats = await this.getPaymentStatistics();

      res.status(200).json({
        success: true,
        message: "Payments retrieved successfully",
        data: payments,
        pagination: paginationMeta,
        stats: paymentStats,
        meta: {
          filter: {
            paymentStatus: queryParams.paymentStatus || 'all',
            paymentMethod: queryParams.paymentMethod || 'all',
            dateRange: queryParams.dateRange || null
          },
          sort: {
            field: queryParams.sortBy,
            order: queryParams.sortOrder
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching payments');
    }
  }

  // Get payment by ID
  async getPaymentById(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment ID format"
        });
      }

      const payment = await Payment.findById(id)
        .populate('order', 'customerName totalAmount finalAmount status items')
        .populate('table', 'tableNumber capacity')
        .populate('handledBy', 'firstName lastName email')
        .lean();

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Payment retrieved successfully",
        data: payment
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching payment');
    }
  }

  // Get payment by order ID
  async getPaymentByOrder(req, res) {
    try {
      const { orderId } = req.params;

      if (!this.isValidObjectId(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format"
        });
      }

      const payment = await Payment.findOne({ order: orderId })
        .populate('order', 'customerName totalAmount finalAmount status')
        .populate('table', 'tableNumber capacity')
        .populate('handledBy', 'firstName lastName')
        .lean();

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found for this order"
        });
      }

      res.status(200).json({
        success: true,
        message: "Payment retrieved successfully",
        data: payment
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching payment by order');
    }
  }

  // Update payment status (for digital payment confirmation)
  async updatePaymentStatus(req, res) {
    try {
      const { id } = req.params;
      const { paymentStatus, transactionId, handledBy } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment ID format"
        });
      }

      if (!this.validPaymentStatuses.includes(paymentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment status. Must be one of: ${this.validPaymentStatuses.join(', ')}`
        });
      }

      const payment = await Payment.findById(id);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found"
        });
      }

      // Validate staff member if provided
      if (handledBy) {
        const staff = await User.findById(handledBy);
        if (!staff) {
          return res.status(400).json({
            success: false,
            message: "Invalid staff ID"
          });
        }
      }

      const updateData = {
        paymentStatus,
        paymentTime: new Date()
      };

      if (transactionId !== undefined) {
        updateData.transactionId = transactionId?.trim() || null;
      }

      if (handledBy) {
        updateData.handledBy = handledBy;
      }

      // Update payment
      const updatedPayment = await Payment.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('order', 'customerName totalAmount finalAmount')
      .populate('table', 'tableNumber capacity')
      .populate('handledBy', 'firstName lastName');

      // Update order status based on payment status
      if (paymentStatus === 'Paid') {
        await Order.findByIdAndUpdate(payment.order, { status: 'Paid' });
        
        // Clear table
        await Table.findByIdAndUpdate(payment.table, {
          status: 'Available',
          currentOrder: null
        });
      } else if (paymentStatus === 'Failed') {
        // Optionally update order status back to served if payment failed
        await Order.findByIdAndUpdate(payment.order, { status: 'Served' });
      }

      console.log(`✅ Payment ${id} status updated to ${paymentStatus}`);

      res.status(200).json({
        success: true,
        message: "Payment status updated successfully",
        data: updatedPayment
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating payment status');
    }
  }

  // Process refund
  async processRefund(req, res) {
    try {
      const { id } = req.params;
      const { refundAmount, reason, handledBy } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment ID format"
        });
      }

      const payment = await Payment.findById(id);
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment not found"
        });
      }

      if (payment.paymentStatus !== 'Paid') {
        return res.status(400).json({
          success: false,
          message: "Can only refund paid payments"
        });
      }

      // Validate refund amount
      const numRefundAmount = parseFloat(refundAmount) || payment.amount;
      if (numRefundAmount <= 0 || numRefundAmount > payment.amount) {
        return res.status(400).json({
          success: false,
          message: "Invalid refund amount"
        });
      }

      // Validate staff member
      if (handledBy) {
        const staff = await User.findById(handledBy);
        if (!staff) {
          return res.status(400).json({
            success: false,
            message: "Invalid staff ID"
          });
        }
      }

      // Create refund record (new payment with negative amount)
      const refundData = {
        order: payment.order,
        table: payment.table,
        amount: -numRefundAmount,
        paymentMethod: payment.paymentMethod,
        paymentStatus: 'Refunded',
        handledBy: handledBy || null,
        transactionId: `REFUND-${payment._id}`,
        paymentTime: new Date()
      };

      const refundPayment = new Payment(refundData);
      await refundPayment.save();

      // Update original payment status if full refund
      if (numRefundAmount === payment.amount) {
        payment.paymentStatus = 'Refunded';
        await payment.save();
      }

      const populatedRefund = await Payment.findById(refundPayment._id)
        .populate('order', 'customerName totalAmount finalAmount')
        .populate('table', 'tableNumber capacity')
        .populate('handledBy', 'firstName lastName');

      res.status(201).json({
        success: true,
        message: "Refund processed successfully",
        data: {
          refund: populatedRefund,
          originalPayment: payment,
          refundAmount: numRefundAmount,
          reason: reason || 'No reason provided'
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error processing refund');
    }
  }

  // Get daily sales report
  async getDailySalesReport(req, res) {
    try {
      const { date } = req.query;
      
      let targetDate = new Date();
      if (date) {
        targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid date format"
          });
        }
      }

      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const [
        payments,
        summary,
        paymentMethodBreakdown,
        hourlyBreakdown
      ] = await Promise.all([
        Payment.find({
          paymentTime: { $gte: startOfDay, $lte: endOfDay },
          paymentStatus: 'Paid'
        })
        .populate('order', 'customerName items')
        .populate('table', 'tableNumber')
        .sort({ paymentTime: 1 }),

        Payment.aggregate([
          {
            $match: {
              paymentTime: { $gte: startOfDay, $lte: endOfDay },
              paymentStatus: 'Paid'
            }
          },
          {
            $group: {
              _id: null,
              totalSales: { $sum: '$amount' },
              totalTransactions: { $sum: 1 },
              averageTransaction: { $avg: '$amount' }
            }
          }
        ]),

        Payment.aggregate([
          {
            $match: {
              paymentTime: { $gte: startOfDay, $lte: endOfDay },
              paymentStatus: 'Paid'
            }
          },
          {
            $group: {
              _id: '$paymentMethod',
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ]),

        Payment.aggregate([
          {
            $match: {
              paymentTime: { $gte: startOfDay, $lte: endOfDay },
              paymentStatus: 'Paid'
            }
          },
          {
            $group: {
              _id: { $hour: '$paymentTime' },
              total: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          {
            $sort: { '_id': 1 }
          }
        ])
      ]);

      const report = {
        date: targetDate.toDateString(),
        summary: summary[0] || { totalSales: 0, totalTransactions: 0, averageTransaction: 0 },
        paymentMethods: paymentMethodBreakdown,
        hourlyBreakdown,
        transactions: payments
      };

      res.status(200).json({
        success: true,
        message: "Daily sales report generated successfully",
        data: report
      });

    } catch (error) {
      this.handleError(error, res, 'Error generating daily sales report');
    }
  }

  // Get payment statistics
  async getPaymentStatistics() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalPayments,
        todayPayments,
        statusStats,
        methodStats,
        revenueToday,
        revenueTotal
      ] = await Promise.all([
        Payment.countDocuments(),
        Payment.countDocuments({ paymentTime: { $gte: today } }),
        Payment.aggregate([
          {
            $group: {
              _id: '$paymentStatus',
              count: { $sum: 1 }
            }
          }
        ]),
        Payment.aggregate([
          {
            $match: { paymentStatus: 'Paid' }
          },
          {
            $group: {
              _id: '$paymentMethod',
              count: { $sum: 1 },
              total: { $sum: '$amount' }
            }
          }
        ]),
        Payment.aggregate([
          {
            $match: {
              paymentTime: { $gte: today },
              paymentStatus: 'Paid'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ]),
        Payment.aggregate([
          {
            $match: { paymentStatus: 'Paid' }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$amount' }
            }
          }
        ])
      ]);

      const result = {
        total: totalPayments,
        today: todayPayments,
        revenue: {
          today: revenueToday[0]?.total || 0,
          total: revenueTotal[0]?.total || 0
        },
        byStatus: {},
        byMethod: {}
      };

      statusStats.forEach(stat => {
        result.byStatus[stat._id.toLowerCase()] = stat.count;
      });

      methodStats.forEach(stat => {
        result.byMethod[stat._id.toLowerCase()] = {
          count: stat.count,
          total: stat.total
        };
      });

      return result;
    } catch (error) {
      console.error('Error calculating payment statistics:', error);
      return null;
    }
  }

  // Helper methods
  parseQueryParameters(query) {
    const {
      page = 1,
      limit = this.defaultPaginationLimit,
      paymentStatus,
      paymentMethod,
      startDate,
      endDate,
      sortBy = 'paymentTime',
      sortOrder = 'desc'
    } = query;

    return {
      pageNum: Math.max(1, parseInt(page)),
      limitNum: Math.min(this.maxPaginationLimit, Math.max(1, parseInt(limit))),
      paymentStatus,
      paymentMethod,
      dateRange: (startDate || endDate) ? { start: startDate, end: endDate } : null,
      sortBy: this.validSortFields.includes(sortBy) ? sortBy : 'paymentTime',
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc'
    };
  }

  buildFilter(queryParams) {
    const filter = {};

    if (queryParams.paymentStatus) {
      filter.paymentStatus = queryParams.paymentStatus;
    }

    if (queryParams.paymentMethod) {
      filter.paymentMethod = queryParams.paymentMethod;
    }

    if (queryParams.dateRange) {
      filter.paymentTime = {};
      if (queryParams.dateRange.start) {
        filter.paymentTime.$gte = new Date(queryParams.dateRange.start);
      }
      if (queryParams.dateRange.end) {
        filter.paymentTime.$lte = new Date(queryParams.dateRange.end);
      }
    }

    return filter;
  }

  buildSort(sortBy, sortOrder) {
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    return sort;
  }

  buildPaginationMetadata(pageNum, limitNum, totalItems) {
    const totalPages = Math.ceil(totalItems / limitNum);
    return {
      currentPage: pageNum,
      totalPages,
      totalItems,
      itemsPerPage: limitNum,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      prevPage: pageNum > 1 ? pageNum - 1 : null
    };
  }

  isValidObjectId(id) {
    return id?.match(/^[0-9a-fA-F]{24}$/);
  }

  handleError(error, res, context) {
    console.error(`${context}:`, error.message);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format"
      });
    }

    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const paymentController = new PaymentController();

// Export controller methods for route handlers
export const processPayment = (req, res) => paymentController.processPayment(req, res);
export const getAllPayments = (req, res) => paymentController.getAllPayments(req, res);
export const getPaymentById = (req, res) => paymentController.getPaymentById(req, res);
export const getPaymentByOrder = (req, res) => paymentController.getPaymentByOrder(req, res);
export const updatePaymentStatus = (req, res) => paymentController.updatePaymentStatus(req, res);
export const processRefund = (req, res) => paymentController.processRefund(req, res);
export const getDailySalesReport = (req, res) => paymentController.getDailySalesReport(req, res);

// Export class for advanced usage
export { PaymentController };

// Export default instance
export default paymentController;
