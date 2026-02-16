import Order from "../models/Order.js";
import Table from "../models/Table.js";
import Menu from "../models/Menu.js";
import User from "../models/User.js";
import { setNewOrderTimeout, clearOrderTimeout } from '../utils/orderTimeoutManager.js';

class OrderController {
  constructor() {
    this.defaultPaginationLimit = 20;
    this.maxPaginationLimit = 100;
    this.validSortFields = ['createdAt', 'updatedAt', 'totalAmount', 'finalAmount', 'status'];
    this.validOrderStatuses = ['Pending', 'InKitchen', 'Served', 'Cancelled', 'Paid', 'Completed'];
    this.validItemStatuses = ['Pending', 'Cooking', 'Ready', 'Served'];
  }

  // Create new order (for QR code scanning customers)
  async createOrder(req, res) {
    try {
      const { tableId, customerName, items, note, discount = 0 } = req.body;

      // Validate required fields
      if (!tableId || !customerName || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Table ID, customer name, and items are required"
        });
      }

      // Validate table
      const table = await Table.findById(tableId);
      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      // Validate and process items
      const processedItems = await this.processOrderItems(items);
      if (!processedItems.success) {
        return res.status(400).json({
          success: false,
          message: processedItems.message,
          errors: processedItems.errors
        });
      }

      // Check for duplicate orders (same customer, same table in last 5 minutes)
      const duplicateCheck = await this.checkForDuplicateOrder(tableId, customerName.trim());
      if (duplicateCheck.isDuplicate) {
        return res.status(409).json({
          success: false,
          message: "A recent order already exists for this customer on this table",
          existingOrder: duplicateCheck.order
        });
      }

      // Check kitchen capacity before accepting order
      const kitchenStatus = await this.checkKitchenCapacity();
      if (!kitchenStatus.canAcceptOrder) {
        return res.status(503).json({
          success: false,
          message: "Kitchen is at full capacity. Please try again shortly.",
          data: {
            activeOrders: kitchenStatus.activeOrders,
            maxCapacity: kitchenStatus.maxCapacity
          }
        });
      }

      // Calculate totals
      const totalAmount = processedItems.items.reduce((sum, item) => sum + item.subtotal, 0);
      const finalAmount = Math.max(0, totalAmount - (discount || 0));

      // Create order
      const orderData = {
        table: tableId,
        customerName: customerName.trim(),
        items: processedItems.items,
        totalAmount,
        discount: discount || 0,
        finalAmount,
        status: 'Pending',
        note: note?.trim() || ''
      };

      const newOrder = new Order(orderData);
      const savedOrder = await newOrder.save();

      // Auto-assign waiter to order
      const assignedWaiter = await this.autoAssignWaiter(tableId);
      if (assignedWaiter) {
        savedOrder.assignedWaiter = assignedWaiter._id;
        await savedOrder.save();
      }

      // Update table status and assign current order
      await Table.findByIdAndUpdate(tableId, {
        status: 'Occupied',
        currentOrder: savedOrder._id,
        assignedWaiter: assignedWaiter?._id
      });

      // Set order timeout (auto-cancel after 30 minutes)
      setNewOrderTimeout(savedOrder._id.toString(), 30);

      // Populate the saved order for response
      const populatedOrder = await Order.findById(savedOrder._id)
        .populate('table', 'tableNumber capacity')
        .populate('items.menuItem', 'name category image')
        .lean();

      console.log(`✅ Order created for table ${table.tableNumber}, customer: ${customerName}`);

      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: {
          ...populatedOrder,
          orderStats: savedOrder.getOrderStats()
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error creating order');
    }
  }

  // Get all orders with filtering and pagination
  async getAllOrders(req, res) {
    try {
      const queryParams = this.parseQueryParameters(req.query);
      const filter = this.buildFilter(queryParams);
      const sort = this.buildSort(queryParams.sortBy, queryParams.sortOrder);

      const [orders, totalOrders] = await Promise.all([
        Order.find(filter)
          .populate('table', 'tableNumber capacity status')
          .populate('items.menuItem', 'name category image')
          .populate('cookedBy', 'firstName lastName')
          .populate('servedBy', 'firstName lastName')
          .sort(sort)
          .skip((queryParams.pageNum - 1) * queryParams.limitNum)
          .limit(queryParams.limitNum)
          .lean(),
        Order.countDocuments(filter)
      ]);

      const paginationMeta = this.buildPaginationMetadata(
        queryParams.pageNum,
        queryParams.limitNum,
        totalOrders
      );

      // Add order statistics
      const orderStats = await this.getOrderStatistics();

      res.status(200).json({
        success: true,
        message: "Orders retrieved successfully",
        data: orders,
        pagination: paginationMeta,
        stats: orderStats,
        meta: {
          filter: {
            status: queryParams.status || 'all',
            table: queryParams.table || null,
            dateRange: queryParams.dateRange || null
          },
          sort: {
            field: queryParams.sortBy,
            order: queryParams.sortOrder
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching orders');
    }
  }

  // Get single order by ID
  async getOrderById(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format"
        });
      }

      const order = await Order.findById(id)
        .populate('table', 'tableNumber capacity status assignedWaiter')
        .populate('items.menuItem', 'name category image description')
        .populate('cookedBy', 'firstName lastName')
        .populate('servedBy', 'firstName lastName')
        .populate({
          path: 'table',
          populate: {
            path: 'assignedWaiter',
            select: 'firstName lastName'
          }
        })
        .lean();

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Order retrieved successfully",
        data: {
          ...order,
          orderStats: {
            totalItems: order.items.length,
            totalQuantity: order.items.reduce((sum, item) => sum + item.quantity, 0),
            pendingItems: order.items.filter(item => item.status === 'Pending').length,
            cookingItems: order.items.filter(item => item.status === 'Cooking').length,
            readyItems: order.items.filter(item => item.status === 'Ready').length,
            servedItems: order.items.filter(item => item.status === 'Served').length
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching order');
    }
  }

  // Get orders by table ID (for customer to view their orders)
  async getOrdersByTable(req, res) {
    try {
      const { tableId } = req.params;
      const { status } = req.query;

      if (!this.isValidObjectId(tableId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const filter = { table: tableId };
      if (status) {
        filter.status = status;
      }

      const orders = await Order.find(filter)
        .populate('items.menuItem', 'name category image')
        .sort({ createdAt: -1 })
        .lean();

      res.status(200).json({
        success: true,
        message: "Table orders retrieved successfully",
        data: orders
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching table orders');
    }
  }

  // Update order status
  async updateOrderStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, cookedBy, servedBy } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format"
        });
      }

      if (!this.validOrderStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${this.validOrderStatuses.join(', ')}`
        });
      }

      const updateData = { status };

      // Validate staff assignments
      if (cookedBy) {
        const cook = await User.findById(cookedBy);
        if (!cook) {
          return res.status(400).json({
            success: false,
            message: "Invalid cook ID"
          });
        }
        updateData.cookedBy = cookedBy;
      }

      if (servedBy) {
        const server = await User.findById(servedBy);
        if (!server) {
          return res.status(400).json({
            success: false,
            message: "Invalid server ID"
          });
        }
        updateData.servedBy = servedBy;
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('table', 'tableNumber capacity')
      .populate('items.menuItem', 'name category image')
      .populate('cookedBy', 'firstName lastName')
      .populate('servedBy', 'firstName lastName');

      if (!updatedOrder) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      // If order is paid, clear the table
      if (status === 'Paid') {
        await Table.findByIdAndUpdate(updatedOrder.table._id, {
          status: 'Available',
          currentOrder: null
        });
      }

      res.status(200).json({
        success: true,
        message: "Order status updated successfully",
        data: updatedOrder
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating order status');
    }
  }

  // Update specific order item status (for kitchen workflow)
  async updateOrderItemStatus(req, res) {
    try {
      const { orderId, itemId } = req.params;
      const { status, notes } = req.body;

      if (!this.isValidObjectId(orderId) || !this.isValidObjectId(itemId)) {
        return res.status(400).json({
          success: false,
          message: "Valid order ID and item ID are required"
        });
      }

      if (!this.validItemStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid item status. Must be one of: ${this.validItemStatuses.join(', ')}`
        });
      }

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      const itemIndex = order.items.findIndex(item => item._id.toString() === itemId);
      if (itemIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Order item not found"
        });
      }

      // Update item status
      order.items[itemIndex].status = status;
      if (notes !== undefined) {
        order.items[itemIndex].notes = notes?.trim() || '';
      }

      // Auto-update order status based on item statuses
      const allItemsServed = order.items.every(item => item.status === 'Served');
      const anyItemCooking = order.items.some(item => ['Cooking', 'Ready'].includes(item.status));

      if (allItemsServed && order.status !== 'Served') {
        order.status = 'Served';
      } else if (anyItemCooking && order.status === 'Pending') {
        order.status = 'InKitchen';
      }

      await order.save();

      const updatedOrder = await Order.findById(orderId)
        .populate('table', 'tableNumber capacity')
        .populate('items.menuItem', 'name category image')
        .lean();

      res.status(200).json({
        success: true,
        message: "Order item status updated successfully",
        data: {
          ...updatedOrder,
          updatedItem: order.items[itemIndex]
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating order item status');
    }
  }

  // Add items to existing order
  async addItemsToOrder(req, res) {
    try {
      const { id } = req.params;
      const { items } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format"
        });
      }

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Items array is required"
        });
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      if (['Cancelled', 'Paid'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: "Cannot add items to cancelled or paid order"
        });
      }

      // Process new items
      const processedItems = await this.processOrderItems(items);
      if (!processedItems.success) {
        return res.status(400).json({
          success: false,
          message: processedItems.message,
          errors: processedItems.errors
        });
      }

      // Add new items to order
      order.items.push(...processedItems.items);

      // Recalculate totals
      const totalAmount = order.items.reduce((sum, item) => sum + item.subtotal, 0);
      order.totalAmount = totalAmount;
      order.finalAmount = totalAmount - (order.discount || 0);

      await order.save();

      const updatedOrder = await Order.findById(id)
        .populate('table', 'tableNumber capacity')
        .populate('items.menuItem', 'name category image')
        .lean();

      res.status(200).json({
        success: true,
        message: "Items added to order successfully",
        data: updatedOrder
      });

    } catch (error) {
      this.handleError(error, res, 'Error adding items to order');
    }
  }

  // Cancel order
  async cancelOrder(req, res) {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format"
        });
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      if (['Served', 'Paid'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel served or paid order"
        });
      }

      // Update order status to cancelled
      order.status = 'Cancelled';
      if (reason) {
        order.note = (order.note ? order.note + '\n' : '') + `Cancelled: ${reason.trim()}`;
      } else {
        order.note = (order.note ? order.note + '\n' : '') + '[CANCELLED BY STAFF]';
      }
      await order.save();

      // Clear timeout since order is cancelled
      clearOrderTimeout(id);

      // Clear table if this was the current order
      await Table.findByIdAndUpdate(order.table, {
        status: 'Available',
        currentOrder: null
      });

      const updatedOrder = await Order.findById(id)
        .populate('table', 'tableNumber capacity')
        .populate('items.menuItem', 'name category image')
        .lean();

      res.status(200).json({
        success: true,
        message: "Order cancelled successfully",
        data: updatedOrder
      });

    } catch (error) {
      this.handleError(error, res, 'Error cancelling order');
    }
  }

  // Complete order (mark as completed and clear table)
  async completeOrder(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order ID format"
        });
      }

      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      if (order.status !== 'Paid') {
        return res.status(400).json({
          success: false,
          message: "Order must be paid before completion"
        });
      }

      const completed = await this.completeOrderCycle(id);
      if (!completed) {
        return res.status(500).json({
          success: false,
          message: "Failed to complete order"
        });
      }

      const completedOrder = await Order.findById(id)
        .populate('table', 'tableNumber capacity')
        .populate('items.menuItem', 'name category')
        .populate('assignedWaiter', 'firstName lastName')
        .lean();

      res.status(200).json({
        success: true,
        message: "Order completed successfully",
        data: completedOrder
      });

    } catch (error) {
      this.handleError(error, res, 'Error completing order');
    }
  }

  // Get kitchen orders (orders in kitchen workflow)
  async getKitchenOrders(req, res) {
    try {
      const { status = 'InKitchen' } = req.query;

      const filter = {
        status: { $in: ['Pending', 'InKitchen'] }
      };

      if (status !== 'all') {
        filter.status = status;
      }

      const kitchenOrders = await Order.find(filter)
        .populate('table', 'tableNumber capacity')
        .populate('items.menuItem', 'name category image description')
        .sort({ createdAt: 1 }) // Oldest first for kitchen queue
        .lean();

      // Group items by status for kitchen display
      const ordersWithGroupedItems = kitchenOrders.map(order => ({
        ...order,
        itemsByStatus: {
          pending: order.items.filter(item => item.status === 'Pending'),
          cooking: order.items.filter(item => item.status === 'Cooking'),
          ready: order.items.filter(item => item.status === 'Ready')
        }
      }));

      res.status(200).json({
        success: true,
        message: "Kitchen orders retrieved successfully",
        data: ordersWithGroupedItems
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching kitchen orders');
    }
  }

  // Get order statistics
  async getOrderStatistics() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [
        totalOrders,
        todayOrders,
        statusStats,
        revenueToday,
        revenueTotal
      ] = await Promise.all([
        Order.countDocuments(),
        Order.countDocuments({ createdAt: { $gte: today } }),
        Order.aggregate([
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 }
            }
          }
        ]),
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: today },
              status: 'Paid'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$finalAmount' }
            }
          }
        ]),
        Order.aggregate([
          {
            $match: {
              status: 'Paid'
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$finalAmount' }
            }
          }
        ])
      ]);

      const result = {
        total: totalOrders,
        today: todayOrders,
        revenue: {
          today: revenueToday[0]?.total || 0,
          total: revenueTotal[0]?.total || 0
        },
        byStatus: {}
      };

      statusStats.forEach(stat => {
        result.byStatus[stat._id.toLowerCase()] = stat.count;
      });

      return result;
    } catch (error) {
      console.error('Error calculating order statistics:', error);
      return null;
    }
  }

  // Helper: Process and validate order items
  async processOrderItems(items) {
    const errors = [];
    const processedItems = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Validate required fields
      if (!item.menuItem || !item.quantity || item.quantity < 1) {
        errors.push(`Item ${i + 1}: Menu item ID and valid quantity are required`);
        continue;
      }

      // Check if menu item exists and is available
      const menuItem = await Menu.findById(item.menuItem);
      if (!menuItem) {
        errors.push(`Item ${i + 1}: Menu item not found`);
        continue;
      }

      if (menuItem.availabilityStatus !== 'Available') {
        errors.push(`Item ${i + 1}: ${menuItem.name} is currently out of stock`);
        continue;
      }

      // Create processed item
      const processedItem = {
        menuItem: item.menuItem,
        name: menuItem.name,
        quantity: parseInt(item.quantity),
        price: menuItem.price,
        subtotal: menuItem.price * parseInt(item.quantity),
        status: 'Pending',
        notes: item.notes?.trim() || ''
      };

      processedItems.push(processedItem);
    }

    if (errors.length > 0) {
      return {
        success: false,
        message: "Invalid items found",
        errors
      };
    }

    return {
      success: true,
      items: processedItems
    };
  }

  // Helper methods
  parseQueryParameters(query) {
    const {
      page = 1,
      limit = this.defaultPaginationLimit,
      status,
      table,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = query;

    return {
      pageNum: Math.max(1, parseInt(page)),
      limitNum: Math.min(this.maxPaginationLimit, Math.max(1, parseInt(limit))),
      status,
      table,
      dateRange: (startDate || endDate) ? { start: startDate, end: endDate } : null,
      sortBy: this.validSortFields.includes(sortBy) ? sortBy : 'createdAt',
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc'
    };
  }

  buildFilter(queryParams) {
    const filter = {};

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    if (queryParams.table) {
      filter.table = queryParams.table;
    }

    if (queryParams.dateRange) {
      filter.createdAt = {};
      if (queryParams.dateRange.start) {
        filter.createdAt.$gte = new Date(queryParams.dateRange.start);
      }
      if (queryParams.dateRange.end) {
        filter.createdAt.$lte = new Date(queryParams.dateRange.end);
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

  // Check kitchen capacity to prevent overload
  async checkKitchenCapacity() {
    try {
      const maxConcurrentOrders = parseInt(process.env.MAX_KITCHEN_ORDERS) || 20;
      
      const activeOrders = await Order.countDocuments({
        status: { $in: ['Pending', 'InKitchen'] }
      });

      const canAcceptOrder = activeOrders < maxConcurrentOrders;
      const utilizationPercent = Math.round((activeOrders / maxConcurrentOrders) * 100);

      return {
        canAcceptOrder,
        activeOrders,
        maxCapacity: maxConcurrentOrders,
        utilizationPercent,
        status: canAcceptOrder ? 'available' : 'at_capacity'
      };
    } catch (error) {
      console.error('Error checking kitchen capacity:', error.message);
      // Default to accepting orders if check fails
      return { canAcceptOrder: true, status: 'unknown' };
    }
  }

  // Check for duplicate orders (same customer, same table in last 5 minutes)
  async checkForDuplicateOrder(tableId, customerName) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const existingOrder = await Order.findOne({
      table: tableId,
      customerName: customerName,
      createdAt: { $gte: fiveMinutesAgo },
      status: { $nin: ['Cancelled', 'Completed'] }
    });

    return {
      isDuplicate: !!existingOrder,
      order: existingOrder
    };
  }

  // Auto-assign waiter to order based on workload
  async autoAssignWaiter(tableId) {
    try {
      // Get all active waiters
      const waiters = await User.find({
        status: 'Active'
      }).populate('role');
      
      const activeWaiters = waiters.filter(user => 
        user.role.name.toLowerCase() === 'waiter' || user.role.name.toLowerCase() === 'staff'
      );

      if (activeWaiters.length === 0) {
        return null;
      }

      // Check if table already has assigned waiter
      const table = await Table.findById(tableId).populate('assignedWaiter');
      if (table.assignedWaiter) {
        return table.assignedWaiter;
      }

      // Find waiter with least active orders
      const waiterWorkloads = await Promise.all(
        activeWaiters.map(async (waiter) => {
          const activeOrders = await Order.countDocuments({
            assignedWaiter: waiter._id,
            status: { $in: ['Pending', 'InKitchen'] }
          });
          return { waiter, activeOrders };
        })
      );

      // Sort by workload and return least busy waiter
      waiterWorkloads.sort((a, b) => a.activeOrders - b.activeOrders);
      return waiterWorkloads[0].waiter;
    } catch (error) {
      console.error('Error in auto-assign waiter:', error.message);
      return null;
    }
  }

  // Handle order timeout
  async handleOrderTimeout(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order || order.status !== 'Pending') {
        return;
      }

      // Mark order as timed out and cancelled
      await Order.findByIdAndUpdate(orderId, {
        status: 'Cancelled',
        isTimedOut: true
      });

      // Clear table
      await Table.findByIdAndUpdate(order.table, {
        status: 'Available',
        currentOrder: null
      });

      console.log(`Order ${orderId} timed out and cancelled`);
    } catch (error) {
      console.error('Error handling order timeout:', error.message);
    }
  }

  // Complete order and clear table
  async completeOrderCycle(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        return false;
      }

      // Mark order as completed
      await Order.findByIdAndUpdate(orderId, {
        status: 'Completed'
      });

      // Clear timeout since order is completed
      clearOrderTimeout(orderId);

      // Clear table and make it available
      await Table.findByIdAndUpdate(order.table, {
        status: 'Available',
        currentOrder: null
      });

      console.log(`Order ${orderId} completed and table cleared`);
      return true;
    } catch (error) {
      console.error('Error completing order cycle:', error.message);
      return false;
    }
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
const orderController = new OrderController();

// Export controller methods for route handlers
export const createOrder = (req, res) => orderController.createOrder(req, res);
export const getAllOrders = (req, res) => orderController.getAllOrders(req, res);
export const getOrderById = (req, res) => orderController.getOrderById(req, res);
export const getOrdersByTable = (req, res) => orderController.getOrdersByTable(req, res);
export const updateOrderStatus = (req, res) => orderController.updateOrderStatus(req, res);
export const updateOrderItemStatus = (req, res) => orderController.updateOrderItemStatus(req, res);
export const addItemsToOrder = (req, res) => orderController.addItemsToOrder(req, res);
export const cancelOrder = (req, res) => orderController.cancelOrder(req, res);
export const getKitchenOrders = (req, res) => orderController.getKitchenOrders(req, res);
export const completeOrder = (req, res) => orderController.completeOrder(req, res);

// Export class for advanced usage
export { OrderController };

// Export default instance
export default orderController;
