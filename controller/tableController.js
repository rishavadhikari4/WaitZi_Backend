import Table from "../models/Table.js";
import Order from "../models/Order.js";
import User from "../models/User.js";

class TableController {
  constructor() {
    this.defaultPaginationLimit = 20;
    this.maxPaginationLimit = 100;
    this.validSortFields = ['tableNumber', 'capacity', 'status', 'createdAt'];
  }

  // Create new table
  async createTable(req, res) {
    try {
      const { tableNumber, capacity, assignedWaiter } = req.body;

      // Validate required fields
      if (!tableNumber || !capacity) {
        return res.status(400).json({
          success: false,
          message: "Table number and capacity are required"
        });
      }

      // Validate capacity
      const numCapacity = parseInt(capacity);
      if (isNaN(numCapacity) || numCapacity < 1) {
        return res.status(400).json({
          success: false,
          message: "Capacity must be a positive number"
        });
      }

      // Check if table number already exists
      const existingTable = await Table.findOne({ tableNumber });
      if (existingTable) {
        return res.status(409).json({
          success: false,
          message: `Table ${tableNumber} already exists`
        });
      }

      // Validate assigned waiter if provided
      if (assignedWaiter) {
        const waiter = await User.findById(assignedWaiter);
        if (!waiter) {
          return res.status(400).json({
            success: false,
            message: "Invalid waiter ID"
          });
        }
      }

      const tableData = {
        tableNumber: parseInt(tableNumber),
        capacity: numCapacity,
        status: 'Available',
        ...(assignedWaiter && { assignedWaiter })
      };

      const newTable = new Table(tableData);
      const savedTable = await newTable.save();

      console.log(`✅ Table ${savedTable.tableNumber} created successfully`);

      res.status(201).json({
        success: true,
        message: "Table created successfully",
        data: savedTable
      });

    } catch (error) {
      this.handleError(error, res, 'Error creating table');
    }
  }

  // Get all tables with filtering and pagination
  async getAllTables(req, res) {
    try {
      const queryParams = this.parseQueryParameters(req.query);
      const filter = this.buildFilter(queryParams);
      const sort = this.buildSort(queryParams.sortBy, queryParams.sortOrder);

      const [tables, totalTables] = await Promise.all([
        Table.find(filter)
          .populate('assignedWaiter', 'firstName lastName email')
          .populate('currentOrder', 'customerName totalAmount status createdAt')
          .sort(sort)
          .skip((queryParams.pageNum - 1) * queryParams.limitNum)
          .limit(queryParams.limitNum)
          .lean(),
        Table.countDocuments(filter)
      ]);

      const paginationMeta = this.buildPaginationMetadata(
        queryParams.pageNum,
        queryParams.limitNum,
        totalTables
      );

      // Add summary statistics
      const tableStats = await this.getTableStatistics();

      res.status(200).json({
        success: true,
        message: "Tables retrieved successfully",
        data: tables,
        pagination: paginationMeta,
        stats: tableStats,
        meta: {
          filter: {
            status: queryParams.status || 'all',
            capacity: queryParams.capacity || null,
            assignedWaiter: queryParams.assignedWaiter || null
          },
          sort: {
            field: queryParams.sortBy,
            order: queryParams.sortOrder
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching tables');
    }
  }

  // Get table by ID (for QR code scanning)
  async getTableById(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(id)
        .populate('assignedWaiter', 'firstName lastName')
        .populate('currentOrder', 'customerName totalAmount status items')
        .lean();

      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Table retrieved successfully",
        data: table
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching table');
    }
  }

  // Get table by table number (for QR code scanning)
  async getTableByNumber(req, res) {
    try {
      const { tableNumber } = req.params;

      if (!tableNumber || isNaN(parseInt(tableNumber))) {
        return res.status(400).json({
          success: false,
          message: "Valid table number is required"
        });
      }

      const table = await Table.findOne({ tableNumber: parseInt(tableNumber) })
        .populate('assignedWaiter', 'firstName lastName')
        .populate('currentOrder', 'customerName totalAmount status items')
        .lean();

      if (!table) {
        return res.status(404).json({
          success: false,
          message: `Table ${tableNumber} not found`
        });
      }

      // Check if table is available for ordering
      const isAvailableForOrder = table.status === 'Available' || 
        (table.status === 'Occupied' && table.currentOrder);

      res.status(200).json({
        success: true,
        message: "Table retrieved successfully",
        data: {
          ...table,
          isAvailableForOrder,
          qrCodeData: {
            tableId: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching table by number');
    }
  }

  // Update table
  async updateTable(req, res) {
    try {
      const { id } = req.params;
      const { tableNumber, capacity, status, assignedWaiter } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const existingTable = await Table.findById(id);
      if (!existingTable) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      const updateData = {};

      // Check table number conflict
      if (tableNumber && parseInt(tableNumber) !== existingTable.tableNumber) {
        const tableConflict = await Table.findOne({
          tableNumber: parseInt(tableNumber),
          _id: { $ne: id }
        });
        if (tableConflict) {
          return res.status(409).json({
            success: false,
            message: `Table ${tableNumber} already exists`
          });
        }
        updateData.tableNumber = parseInt(tableNumber);
      }

      // Validate and update capacity
      if (capacity !== undefined) {
        const numCapacity = parseInt(capacity);
        if (isNaN(numCapacity) || numCapacity < 1) {
          return res.status(400).json({
            success: false,
            message: "Capacity must be a positive number"
          });
        }
        updateData.capacity = numCapacity;
      }

      // Update status
      if (status && ['Available', 'Occupied', 'Reserved'].includes(status)) {
        updateData.status = status;
      }

      // Validate and update assigned waiter
      if (assignedWaiter !== undefined) {
        if (assignedWaiter === null || assignedWaiter === '') {
          updateData.assignedWaiter = null;
        } else {
          const waiter = await User.findById(assignedWaiter);
          if (!waiter) {
            return res.status(400).json({
              success: false,
              message: "Invalid waiter ID"
            });
          }
          updateData.assignedWaiter = assignedWaiter;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: "No valid fields provided for update"
        });
      }

      const updatedTable = await Table.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      )
      .populate('assignedWaiter', 'firstName lastName email')
      .populate('currentOrder', 'customerName totalAmount status');

      console.log(`✅ Table ${updatedTable.tableNumber} updated successfully`);

      res.status(200).json({
        success: true,
        message: "Table updated successfully",
        data: updatedTable
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating table');
    }
  }

  // Delete table
  async deleteTable(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(id);
      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      // Check if table has active order
      if (table.currentOrder) {
        return res.status(400).json({
          success: false,
          message: "Cannot delete table with active order"
        });
      }

      await Table.findByIdAndDelete(id);

      console.log(`✅ Table ${table.tableNumber} deleted successfully`);

      res.status(200).json({
        success: true,
        message: "Table deleted successfully",
        data: {
          deletedTable: {
            id: table._id,
            tableNumber: table.tableNumber
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error deleting table');
    }
  }

  // Check table availability for new orders (prevent double booking)
  async checkTableAvailability(req, res) {
    try {
      const { tableId } = req.params;

      if (!this.isValidObjectId(tableId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(tableId)
        .populate('currentOrder', 'status customerName')
        .lean();

      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      const isAvailable = table.status === 'Available' || 
        (table.currentOrder && ['Paid', 'Completed', 'Cancelled'].includes(table.currentOrder.status));

      res.status(200).json({
        success: true,
        message: "Table availability checked",
        data: {
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            status: table.status
          },
          isAvailable,
          currentOrder: table.currentOrder,
          canTakeNewOrder: isAvailable
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error checking table availability');
    }
  }

  // Reset table for new customers (cleanup completed orders)
  async resetTableForNewCustomers(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(id).populate('currentOrder');
      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      // Only reset if current order is completed or paid
      if (table.currentOrder && !['Paid', 'Completed', 'Cancelled'].includes(table.currentOrder.status)) {
        return res.status(400).json({
          success: false,
          message: "Cannot reset table with active order"
        });
      }

      const resetTable = await Table.findByIdAndUpdate(
        id,
        {
          status: 'Available',
          currentOrder: null
        },
        { new: true }
      ).populate('assignedWaiter', 'firstName lastName');

      res.status(200).json({
        success: true,
        message: "Table reset for new customers",
        data: resetTable
      });

    } catch (error) {
      this.handleError(error, res, 'Error resetting table');
    }
  }

  // Update table status (quick status change)
  async updateTableStatus(req, res) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      if (!['Available', 'Occupied', 'Reserved'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Must be Available, Occupied, or Reserved"
        });
      }

      const updatedTable = await Table.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      )
      .populate('assignedWaiter', 'firstName lastName')
      .populate('currentOrder', 'customerName totalAmount status');

      if (!updatedTable) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Table status updated successfully",
        data: updatedTable
      });

    } catch (error) {
      this.handleError(error, res, 'Error updating table status');
    }
  }

  // Assign order to table
  async assignOrderToTable(req, res) {
    try {
      const { tableId, orderId } = req.body;

      if (!this.isValidObjectId(tableId) || !this.isValidObjectId(orderId)) {
        return res.status(400).json({
          success: false,
          message: "Valid table ID and order ID are required"
        });
      }

      const [table, order] = await Promise.all([
        Table.findById(tableId),
        Order.findById(orderId)
      ]);

      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      if (!order) {
        return res.status(404).json({
          success: false,
          message: "Order not found"
        });
      }

      // Update table with current order and set status to Occupied
      const updatedTable = await Table.findByIdAndUpdate(
        tableId,
        {
          currentOrder: orderId,
          status: 'Occupied'
        },
        { new: true }
      )
      .populate('assignedWaiter', 'firstName lastName')
      .populate('currentOrder', 'customerName totalAmount status');

      res.status(200).json({
        success: true,
        message: "Order assigned to table successfully",
        data: updatedTable
      });

    } catch (error) {
      this.handleError(error, res, 'Error assigning order to table');
    }
  }

  // Clear order from table (when order is completed/paid)
  async clearOrderFromTable(req, res) {
    try {
      const { id } = req.params;

      if (!this.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const updatedTable = await Table.findByIdAndUpdate(
        id,
        {
          currentOrder: null,
          status: 'Available'
        },
        { new: true }
      )
      .populate('assignedWaiter', 'firstName lastName');

      if (!updatedTable) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      res.status(200).json({
        success: true,
        message: "Table cleared successfully",
        data: updatedTable
      });

    } catch (error) {
      this.handleError(error, res, 'Error clearing table');
    }
  }

  // Get table statistics
  async getTableStatistics() {
    try {
      const stats = await Table.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const totalTables = await Table.countDocuments();
      const totalCapacity = await Table.aggregate([
        {
          $group: {
            _id: null,
            totalCapacity: { $sum: '$capacity' }
          }
        }
      ]);

      const result = {
        total: totalTables,
        totalCapacity: totalCapacity[0]?.totalCapacity || 0,
        available: 0,
        occupied: 0,
        reserved: 0
      };

      stats.forEach(stat => {
        result[stat._id.toLowerCase()] = stat.count;
      });

      return result;
    } catch (error) {
      console.error('Error calculating table statistics:', error);
      return null;
    }
  }

  // Helper methods
  parseQueryParameters(query) {
    const {
      page = 1,
      limit = this.defaultPaginationLimit,
      status,
      capacity,
      assignedWaiter,
      sortBy = 'tableNumber',
      sortOrder = 'asc'
    } = query;

    return {
      pageNum: Math.max(1, parseInt(page)),
      limitNum: Math.min(this.maxPaginationLimit, Math.max(1, parseInt(limit))),
      status,
      capacity: capacity ? parseInt(capacity) : null,
      assignedWaiter,
      sortBy: this.validSortFields.includes(sortBy) ? sortBy : 'tableNumber',
      sortOrder: sortOrder === 'desc' ? 'desc' : 'asc'
    };
  }

  buildFilter(queryParams) {
    const filter = {};

    if (queryParams.status) {
      filter.status = queryParams.status;
    }

    if (queryParams.capacity !== null) {
      filter.capacity = queryParams.capacity;
    }

    if (queryParams.assignedWaiter) {
      filter.assignedWaiter = queryParams.assignedWaiter;
    }

    return filter;
  }

  buildSort(sortBy, sortOrder) {
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
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

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Table number already exists"
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const tableController = new TableController();

// Export controller methods for route handlers
export const createTable = (req, res) => tableController.createTable(req, res);
export const getAllTables = (req, res) => tableController.getAllTables(req, res);
export const getTableById = (req, res) => tableController.getTableById(req, res);
export const getTableByNumber = (req, res) => tableController.getTableByNumber(req, res);
export const updateTable = (req, res) => tableController.updateTable(req, res);
export const deleteTable = (req, res) => tableController.deleteTable(req, res);
export const updateTableStatus = (req, res) => tableController.updateTableStatus(req, res);
export const assignOrderToTable = (req, res) => tableController.assignOrderToTable(req, res);
export const clearOrderFromTable = (req, res) => tableController.clearOrderFromTable(req, res);
export const checkTableAvailability = (req, res) => tableController.checkTableAvailability(req, res);
export const resetTableForNewCustomers = (req, res) => tableController.resetTableForNewCustomers(req, res);

// Export class for advanced usage
export { TableController };

// Export default instance
export default tableController;
