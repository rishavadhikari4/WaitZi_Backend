import Order from "../models/Order.js";
import Payment from "../models/Payment.js";
import Table from "../models/Table.js";
import Menu from "../models/Menu.js";
import User from "../models/User.js";
import Category from "../models/Category.js";

class DashboardController {
  constructor() {
    this.timeZone = 'Asia/Kathmandu'; // Adjust for your restaurant's timezone
  }

  // Get comprehensive dashboard overview
  async getDashboardOverview(req, res) {
    try {
      const { period = 'today' } = req.query;
      const dateRange = this.getDateRange(period);

      const [
        overallStats,
        recentOrders,
        salesTrends,
        popularItems,
        tableStatus,
        staffStats,
        pendingOrders
      ] = await Promise.all([
        this.getOverallStatistics(dateRange),
        this.getRecentOrders(),
        this.getSalesTrends(dateRange),
        this.getPopularMenuItems(dateRange),
        this.getTableStatusSummary(),
        this.getStaffStatistics(dateRange),
        this.getPendingOrders()
      ]);

      res.status(200).json({
        success: true,
        message: "Dashboard overview retrieved successfully",
        data: {
          period,
          dateRange,
          overview: overallStats,
          recentActivity: {
            orders: recentOrders,
            pendingOrders
          },
          analytics: {
            salesTrends,
            popularItems
          },
          operations: {
            tableStatus,
            staffStats
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching dashboard overview');
    }
  }

  // Get detailed sales analytics
  async getSalesAnalytics(req, res) {
    try {
      const { period = 'week', groupBy = 'day' } = req.query;
      const dateRange = this.getDateRange(period);

      const [
        salesSummary,
        salesTrends,
        paymentMethodBreakdown,
        hourlyDistribution,
        categoryPerformance,
        topCustomers
      ] = await Promise.all([
        this.getSalesSummary(dateRange),
        this.getSalesTrendsByPeriod(dateRange, groupBy),
        this.getPaymentMethodBreakdown(dateRange),
        this.getHourlySalesDistribution(dateRange),
        this.getCategoryPerformance(dateRange),
        this.getTopCustomers(dateRange)
      ]);

      res.status(200).json({
        success: true,
        message: "Sales analytics retrieved successfully",
        data: {
          period,
          groupBy,
          dateRange,
          summary: salesSummary,
          trends: salesTrends,
          breakdowns: {
            paymentMethods: paymentMethodBreakdown,
            hourlyDistribution,
            categoryPerformance
          },
          customers: topCustomers
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching sales analytics');
    }
  }

  // Get operational insights
  async getOperationalInsights(req, res) {
    try {
      const { period = 'today' } = req.query;
      const dateRange = this.getDateRange(period);

      const [
        kitchenPerformance,
        serviceMetrics,
        tableUtilization,
        staffPerformance,
        orderStatusDistribution,
        averageOrderValue
      ] = await Promise.all([
        this.getKitchenPerformance(dateRange),
        this.getServiceMetrics(dateRange),
        this.getTableUtilization(dateRange),
        this.getStaffPerformance(dateRange),
        this.getOrderStatusDistribution(dateRange),
        this.getAverageOrderValue(dateRange)
      ]);

      res.status(200).json({
        success: true,
        message: "Operational insights retrieved successfully",
        data: {
          period,
          dateRange,
          kitchen: kitchenPerformance,
          service: serviceMetrics,
          tables: tableUtilization,
          staff: staffPerformance,
          orders: {
            statusDistribution: orderStatusDistribution,
            averageValue: averageOrderValue
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching operational insights');
    }
  }

  // Get menu performance analytics
  async getMenuAnalytics(req, res) {
    try {
      const { period = 'week', categoryId } = req.query;
      const dateRange = this.getDateRange(period);

      const [
        menuSummary,
        topSellingItems,
        underPerformingItems,
        categoryBreakdown,
        itemProfitability,
        stockAlerts
      ] = await Promise.all([
        this.getMenuSummary(dateRange, categoryId),
        this.getTopSellingItems(dateRange, categoryId),
        this.getUnderPerformingItems(dateRange, categoryId),
        this.getCategoryBreakdown(dateRange),
        this.getItemProfitability(dateRange, categoryId),
        this.getStockAlerts()
      ]);

      res.status(200).json({
        success: true,
        message: "Menu analytics retrieved successfully",
        data: {
          period,
          dateRange,
          categoryFilter: categoryId || 'all',
          summary: menuSummary,
          performance: {
            topSelling: topSellingItems,
            underPerforming: underPerformingItems
          },
          analytics: {
            categoryBreakdown,
            profitability: itemProfitability
          },
          alerts: stockAlerts
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching menu analytics');
    }
  }

  // Get real-time restaurant status
  async getRealTimeStatus(req, res) {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [
        activeOrders,
        pendingOrders,
        kitchenQueue,
        tableStats,
        staffOnDuty,
        revenueResult
      ] = await Promise.all([
        Order.countDocuments({ status: { $in: ['Pending', 'InKitchen', 'Served'] } }),
        Order.countDocuments({ status: 'Pending' }),
        Order.countDocuments({ status: 'InKitchen' }),
        this.getTableStatusSummary(),
        User.countDocuments({ status: 'Active' }),
        Payment.aggregate([
          { $match: { paymentTime: { $gte: todayStart }, paymentStatus: 'Paid' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ])
      ]);

      res.status(200).json({
        success: true,
        message: "Real-time status retrieved successfully",
        data: {
          activeOrders,
          pendingOrders,
          kitchenQueue,
          availableTables: tableStats.byStatus.available ?? 0,
          occupiedTables: tableStats.byStatus.occupied ?? 0,
          staffOnDuty,
          totalRevenue: revenueResult[0]?.total ?? 0,
          lastUpdated: new Date().toISOString()
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching real-time status');
    }
  }

  // Helper methods for data aggregation

  getDateRange(period) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (period) {
      case 'today':
        return {
          start: today,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        };
      case 'yesterday':
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return {
          start: yesterday,
          end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
        };
      case 'week':
        const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: weekStart, end: now };
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: monthStart, end: now };
      case 'year':
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return { start: yearStart, end: now };
      default:
        return { start: today, end: now };
    }
  }

  async getOverallStatistics(dateRange) {
    const [orderStats, salesStats, tableStats, menuStats] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] }
            },
            totalRevenue: {
              $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, '$finalAmount', 0] }
            },
            averageOrderValue: { $avg: '$finalAmount' }
          }
        }
      ]),
      Payment.aggregate([
        {
          $match: {
            paymentTime: { $gte: dateRange.start, $lte: dateRange.end },
            paymentStatus: 'Paid'
          }
        },
        {
          $group: {
            _id: null,
            totalPayments: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]),
      Table.countDocuments(),
      Menu.countDocuments({ availabilityStatus: 'Available' })
    ]);

    return {
      orders: orderStats[0] || { totalOrders: 0, completedOrders: 0, cancelledOrders: 0, totalRevenue: 0, averageOrderValue: 0 },
      payments: salesStats[0] || { totalPayments: 0, totalAmount: 0 },
      totalTables: tableStats,
      availableMenuItems: menuStats
    };
  }

  async getRecentOrders(limit = 10) {
    return await Order.find()
      .populate('table', 'tableNumber capacity')
      .populate('items.menuItem', 'name price')
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async getSalesTrends(dateRange, groupBy = 'hour') {
    const groupStage = this.getGroupStageByPeriod(groupBy);
    
    return await Payment.aggregate([
      {
        $match: {
          paymentTime: { $gte: dateRange.start, $lte: dateRange.end },
          paymentStatus: 'Paid'
        }
      },
      {
        $group: {
          _id: groupStage,
          totalSales: { $sum: '$amount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { '_id': 1 } }
    ]);
  }

  async getPopularMenuItems(dateRange, limit = 10) {
    return await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: dateRange.start, $lte: dateRange.end },
          status: { $ne: 'Cancelled' }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.menuItem',
          name: { $first: '$items.name' },
          totalQuantity: { $sum: '$items.quantity' },
          totalRevenue: { $sum: '$items.subtotal' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalQuantity: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'menus',
          localField: '_id',
          foreignField: '_id',
          as: 'menuDetails'
        }
      }
    ]);
  }

  async getTableStatusSummary() {
    const [statusCounts, utilizationData] = await Promise.all([
      Table.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      Table.aggregate([
        {
          $group: {
            _id: null,
            totalCapacity: { $sum: '$capacity' },
            occupiedCapacity: {
              $sum: {
                $cond: [{ $eq: ['$status', 'Occupied'] }, '$capacity', 0]
              }
            }
          }
        }
      ])
    ]);

    const statusSummary = {
      available: 0,
      occupied: 0,
      reserved: 0
    };

    statusCounts.forEach(item => {
      statusSummary[item._id.toLowerCase()] = item.count;
    });

    return {
      byStatus: statusSummary,
      utilization: utilizationData[0] || { totalCapacity: 0, occupiedCapacity: 0 }
    };
  }

  async getStaffStatistics(dateRange) {
    const [totalStaff, activeStaff, ordersByStaff] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: 'Active' }),
      Order.aggregate([
        {
          $match: {
            createdAt: { $gte: dateRange.start, $lte: dateRange.end },
            $or: [
              { cookedBy: { $exists: true } },
              { servedBy: { $exists: true } }
            ]
          }
        },
        {
          $group: {
            _id: null,
            ordersCookedCount: {
              $sum: { $cond: [{ $ne: ['$cookedBy', null] }, 1, 0] }
            },
            ordersServedCount: {
              $sum: { $cond: [{ $ne: ['$servedBy', null] }, 1, 0] }
            }
          }
        }
      ])
    ]);

    return {
      total: totalStaff,
      active: activeStaff,
      performance: ordersByStaff[0] || { ordersCookedCount: 0, ordersServedCount: 0 }
    };
  }

  async getPendingOrders() {
    return await Order.find({
      status: { $in: ['Pending', 'InKitchen'] }
    })
    .populate('table', 'tableNumber')
    .populate('items.menuItem', 'name')
    .sort({ createdAt: 1 })
    .limit(20)
    .lean();
  }

  getGroupStageByPeriod(groupBy) {
    switch (groupBy) {
      case 'hour':
        return {
          year: { $year: '$paymentTime' },
          month: { $month: '$paymentTime' },
          day: { $dayOfMonth: '$paymentTime' },
          hour: { $hour: '$paymentTime' }
        };
      case 'day':
        return {
          year: { $year: '$paymentTime' },
          month: { $month: '$paymentTime' },
          day: { $dayOfMonth: '$paymentTime' }
        };
      case 'week':
        return {
          year: { $year: '$paymentTime' },
          week: { $week: '$paymentTime' }
        };
      case 'month':
        return {
          year: { $year: '$paymentTime' },
          month: { $month: '$paymentTime' }
        };
      default:
        return { $dateToString: { format: '%Y-%m-%d', date: '$paymentTime' } };
    }
  }

  // Additional helper methods — return safe defaults (TODO: implement full logic)
  async getSalesSummary(dateRange) {
    return await Payment.aggregate([
      { $match: { paymentTime: { $gte: dateRange.start, $lte: dateRange.end }, paymentStatus: 'Paid' } },
      { $group: { _id: null, totalSales: { $sum: '$amount' }, totalTransactions: { $sum: 1 }, averageTransaction: { $avg: '$amount' } } }
    ]).then(r => r[0] || { totalSales: 0, totalTransactions: 0, averageTransaction: 0 });
  }
  async getSalesTrendsByPeriod(dateRange, groupBy) {
    return await this.getSalesTrends(dateRange, groupBy);
  }
  async getPaymentMethodBreakdown(dateRange) {
    return await Payment.aggregate([
      { $match: { paymentTime: { $gte: dateRange.start, $lte: dateRange.end }, paymentStatus: 'Paid' } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
  }
  async getHourlySalesDistribution(dateRange) {
    return await Payment.aggregate([
      { $match: { paymentTime: { $gte: dateRange.start, $lte: dateRange.end }, paymentStatus: 'Paid' } },
      { $group: { _id: { $hour: '$paymentTime' }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { '_id': 1 } }
    ]);
  }
  async getCategoryPerformance(dateRange) {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: dateRange.start, $lte: dateRange.end }, status: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      { $lookup: { from: 'menus', localField: 'items.menuItem', foreignField: '_id', as: 'menu' } },
      { $unwind: { path: '$menu', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$menu.category', totalRevenue: { $sum: '$items.subtotal' }, totalQuantity: { $sum: '$items.quantity' } } },
      { $lookup: { from: 'categories', localField: '_id', foreignField: '_id', as: 'category' } },
      { $sort: { totalRevenue: -1 } }
    ]);
  }
  async getTopCustomers(dateRange) {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: dateRange.start, $lte: dateRange.end }, status: 'Paid' } },
      { $group: { _id: '$customerName', totalSpent: { $sum: '$finalAmount' }, orderCount: { $sum: 1 } } },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);
  }
  async getKitchenPerformance(dateRange) {
    const activeOrders = await Order.countDocuments({ status: { $in: ['Pending', 'InKitchen'] } });
    return { activeOrders, period: dateRange };
  }
  async getServiceMetrics(dateRange) {
    const totalOrders = await Order.countDocuments({ createdAt: { $gte: dateRange.start, $lte: dateRange.end } });
    const cancelledOrders = await Order.countDocuments({ createdAt: { $gte: dateRange.start, $lte: dateRange.end }, status: 'Cancelled' });
    return { totalOrders, cancelledOrders, cancellationRate: totalOrders > 0 ? ((cancelledOrders / totalOrders) * 100).toFixed(1) + '%' : '0%' };
  }
  async getTableUtilization(dateRange) {
    return await this.getTableStatusSummary();
  }
  async getStaffPerformance(dateRange) {
    return await this.getStaffStatistics(dateRange);
  }
  async getOrderStatusDistribution(dateRange) {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: dateRange.start, $lte: dateRange.end } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
  }
  async getAverageOrderValue(dateRange) {
    const result = await Order.aggregate([
      { $match: { createdAt: { $gte: dateRange.start, $lte: dateRange.end }, status: 'Paid' } },
      { $group: { _id: null, average: { $avg: '$finalAmount' } } }
    ]);
    return result[0]?.average || 0;
  }
  async getMenuSummary(dateRange, categoryId) {
    const filter = { createdAt: { $gte: dateRange.start, $lte: dateRange.end }, status: { $ne: 'Cancelled' } };
    const totalItemsSold = await Order.aggregate([
      { $match: filter }, { $unwind: '$items' },
      { $group: { _id: null, total: { $sum: '$items.quantity' } } }
    ]);
    return { totalItemsSold: totalItemsSold[0]?.total || 0, totalMenuItems: await Menu.countDocuments() };
  }
  async getTopSellingItems(dateRange, categoryId) {
    return await this.getPopularMenuItems(dateRange, 10);
  }
  async getUnderPerformingItems(dateRange, categoryId) {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: dateRange.start, $lte: dateRange.end }, status: { $ne: 'Cancelled' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.menuItem', name: { $first: '$items.name' }, totalQuantity: { $sum: '$items.quantity' } } },
      { $sort: { totalQuantity: 1 } },
      { $limit: 10 }
    ]);
  }
  async getCategoryBreakdown(dateRange) {
    return await this.getCategoryPerformance(dateRange);
  }
  async getItemProfitability(dateRange, categoryId) {
    return await Order.aggregate([
      { $match: { createdAt: { $gte: dateRange.start, $lte: dateRange.end }, status: 'Paid' } },
      { $unwind: '$items' },
      { $group: { _id: '$items.menuItem', name: { $first: '$items.name' }, totalRevenue: { $sum: '$items.subtotal' }, totalQuantity: { $sum: '$items.quantity' } } },
      { $sort: { totalRevenue: -1 } }
    ]);
  }
  async getStockAlerts() {
    return await Menu.find({ availabilityStatus: 'Out of Stock' }).select('name category').lean();
  }
  async getCurrentOrders() {
    return await Order.find({ status: { $in: ['Pending', 'InKitchen', 'Served'] } })
      .populate('table', 'tableNumber').sort({ createdAt: 1 }).limit(20).lean();
  }
  async getActiveTables() {
    return await Table.find({ status: { $ne: 'Available' } })
      .populate('currentOrder', 'customerName status').populate('assignedWaiter', 'firstName lastName').lean();
  }
  async getKitchenQueue() {
    return await Order.find({ status: { $in: ['Pending', 'InKitchen'] } })
      .populate('table', 'tableNumber').populate('items.menuItem', 'name').sort({ createdAt: 1 }).lean();
  }
  async getWaitingCustomers() {
    return await Order.countDocuments({ status: 'Pending' });
  }
  async getStaffOnDuty() {
    return await User.find({ status: 'Active' }).populate('role').select('firstName lastName role').lean();
  }
  async getTodaysSummary() {
    const todayRange = this.getDateRange('today');
    return await this.getOverallStatistics(todayRange);
  }

  handleError(error, res, context) {
    console.error(`${context}:`, error.message);

    res.status(500).json({
      success: false,
      message: "Internal server error",
      context
    });
  }
}

// Create singleton instance
const dashboardController = new DashboardController();

// Export controller methods for route handlers
export const getDashboardOverview = (req, res) => dashboardController.getDashboardOverview(req, res);
export const getSalesAnalytics = (req, res) => dashboardController.getSalesAnalytics(req, res);
export const getOperationalInsights = (req, res) => dashboardController.getOperationalInsights(req, res);
export const getMenuAnalytics = (req, res) => dashboardController.getMenuAnalytics(req, res);
export const getRealTimeStatus = (req, res) => dashboardController.getRealTimeStatus(req, res);

// Export class for advanced usage
export { DashboardController };

// Export default instance
export default dashboardController;