import QRCode from 'qrcode';
import Table from '../models/Table.js';
import Category from '../models/Category.js';
import Menu from '../models/Menu.js';

class QRController {
  constructor() {
    this.baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.qrOptions = {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    };
  }

  // Generate QR code for a table
  async generateTableQR(req, res) {
    try {
      const { tableId } = req.params;
      const { format = 'png' } = req.query;

      if (!this.isValidObjectId(tableId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(tableId);
      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      // Create QR data URL
      const qrData = `${this.baseUrl}/order/table/${table.tableNumber}?tableId=${tableId}`;

      if (format === 'url') {
        // Return just the URL data
        return res.status(200).json({
          success: true,
          message: "QR data generated successfully",
          data: {
            qrData,
            table: {
              id: table._id,
              tableNumber: table.tableNumber,
              capacity: table.capacity
            }
          }
        });
      }

      // Generate QR code image
      const qrCodeImage = await QRCode.toDataURL(qrData, this.qrOptions);

      res.status(200).json({
        success: true,
        message: "QR code generated successfully",
        data: {
          qrCode: qrCodeImage,
          qrData,
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity,
            status: table.status
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error generating QR code');
    }
  }

  // Generate QR codes for all tables
  async generateAllTableQRs(req, res) {
    try {
      const { format = 'png' } = req.query;

      const tables = await Table.find({}).sort({ tableNumber: 1 }).lean();

      if (tables.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No tables found"
        });
      }

      const qrCodes = [];

      for (const table of tables) {
        const qrData = `${this.baseUrl}/order/table/${table.tableNumber}?tableId=${table._id}`;

        if (format === 'url') {
          qrCodes.push({
            table: {
              id: table._id,
              tableNumber: table.tableNumber,
              capacity: table.capacity
            },
            qrData
          });
        } else {
          const qrCodeImage = await QRCode.toDataURL(qrData, this.qrOptions);
          qrCodes.push({
            table: {
              id: table._id,
              tableNumber: table.tableNumber,
              capacity: table.capacity,
              status: table.status
            },
            qrCode: qrCodeImage,
            qrData
          });
        }
      }

      res.status(200).json({
        success: true,
        message: "QR codes generated successfully",
        data: qrCodes,
        meta: {
          totalTables: tables.length,
          format
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error generating QR codes for all tables');
    }
  }

  // Get ordering page data for QR scan
  async getOrderingPageData(req, res) {
    try {
      const { tableId } = req.params;

      if (!this.isValidObjectId(tableId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      // Get table details
      const table = await Table.findById(tableId)
        .populate('assignedWaiter', 'firstName lastName')
        .populate('currentOrder', 'customerName status totalAmount')
        .lean();

      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      // Get all active categories with available menu items
      const categories = await Category.find({ isActive: true })
        .sort({ name: 1 })
        .lean();

      const menuData = [];

      for (const category of categories) {
        const menuItems = await Menu.find({
          category: category._id,
          availabilityStatus: 'Available'
        })
        .sort({ name: 1 })
        .lean();

        if (menuItems.length > 0) {
          menuData.push({
            ...category,
            items: menuItems
          });
        }
      }

      // Check if table is available for ordering
      const isAvailableForOrder = table.status === 'Available' || 
        (table.status === 'Occupied' && table.currentOrder);

      res.status(200).json({
        success: true,
        message: "Ordering page data retrieved successfully",
        data: {
          table: {
            ...table,
            isAvailableForOrder
          },
          menu: menuData,
          restaurant: {
            name: process.env.RESTAURANT_NAME || 'WaitZi Restaurant',
            welcomeMessage: "Welcome! Please scan the QR code on your table to place your order."
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching ordering page data');
    }
  }

  // Get ordering page data by table number (alternative endpoint)
  async getOrderingPageByTableNumber(req, res) {
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
        .populate('currentOrder', 'customerName status totalAmount')
        .lean();

      if (!table) {
        return res.status(404).json({
          success: false,
          message: `Table ${tableNumber} not found`
        });
      }

      // Redirect to the main ordering page data method
      req.params.tableId = table._id.toString();
      return this.getOrderingPageData(req, res);

    } catch (error) {
      this.handleError(error, res, 'Error fetching ordering page data by table number');
    }
  }

  // Download QR code as image file
  async downloadQRCode(req, res) {
    try {
      const { tableId } = req.params;
      const { format = 'png' } = req.query;

      if (!this.isValidObjectId(tableId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(tableId);
      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      const qrData = `${this.baseUrl}/order/table/${table.tableNumber}?tableId=${tableId}`;

      // Generate QR code buffer based on format
      let qrBuffer;
      let contentType;
      let filename;

      if (format === 'svg') {
        qrBuffer = await QRCode.toString(qrData, { 
          ...this.qrOptions, 
          type: 'svg' 
        });
        contentType = 'image/svg+xml';
        filename = `table-${table.tableNumber}-qr.svg`;
      } else {
        // Default to PNG
        qrBuffer = await QRCode.toBuffer(qrData, {
          ...this.qrOptions,
          type: 'png'
        });
        contentType = 'image/png';
        filename = `table-${table.tableNumber}-qr.png`;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(qrBuffer);

    } catch (error) {
      this.handleError(error, res, 'Error downloading QR code');
    }
  }

  // Generate custom QR with restaurant branding
  async generateBrandedQR(req, res) {
    try {
      const { tableId } = req.params;
      const { 
        logoUrl, 
        primaryColor = '#000000', 
        backgroundColor = '#FFFFFF',
        title,
        subtitle
      } = req.body;

      if (!this.isValidObjectId(tableId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(tableId);
      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      const qrData = `${this.baseUrl}/order/table/${table.tableNumber}?tableId=${tableId}`;

      // Create custom QR options with branding
      const customOptions = {
        ...this.qrOptions,
        color: {
          dark: primaryColor,
          light: backgroundColor
        },
        width: 400
      };

      const qrCodeImage = await QRCode.toDataURL(qrData, customOptions);

      res.status(200).json({
        success: true,
        message: "Branded QR code generated successfully",
        data: {
          qrCode: qrCodeImage,
          qrData,
          branding: {
            logoUrl,
            primaryColor,
            backgroundColor,
            title: title || `Table ${table.tableNumber}`,
            subtitle: subtitle || 'Scan to order'
          },
          table: {
            id: table._id,
            tableNumber: table.tableNumber,
            capacity: table.capacity
          }
        }
      });

    } catch (error) {
      this.handleError(error, res, 'Error generating branded QR code');
    }
  }

  // Get QR analytics (scan tracking would need additional implementation)
  async getQRAnalytics(req, res) {
    try {
      const { tableId } = req.params;
      const { startDate, endDate } = req.query;

      if (!this.isValidObjectId(tableId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid table ID format"
        });
      }

      const table = await Table.findById(tableId);
      if (!table) {
        return res.status(404).json({
          success: false,
          message: "Table not found"
        });
      }

      // This is a placeholder - in a real implementation, you'd track QR scans
      const analytics = {
        table: {
          id: table._id,
          tableNumber: table.tableNumber,
          capacity: table.capacity
        },
        qrData: `${this.baseUrl}/order/table/${table.tableNumber}?tableId=${tableId}`,
        analytics: {
          totalScans: 0, // Would be tracked with additional logging
          uniqueScans: 0,
          ordersFromScans: 0,
          conversionRate: '0%',
          lastScanned: null,
          period: {
            start: startDate || null,
            end: endDate || null
          }
        },
        note: "QR scan tracking requires additional implementation for detailed analytics"
      };

      res.status(200).json({
        success: true,
        message: "QR analytics retrieved successfully",
        data: analytics
      });

    } catch (error) {
      this.handleError(error, res, 'Error fetching QR analytics');
    }
  }

  // Helper methods
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

    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// Create singleton instance
const qrController = new QRController();

// Export controller methods for route handlers
export const generateTableQR = (req, res) => qrController.generateTableQR(req, res);
export const generateAllTableQRs = (req, res) => qrController.generateAllTableQRs(req, res);
export const getOrderingPageData = (req, res) => qrController.getOrderingPageData(req, res);
export const getOrderingPageByTableNumber = (req, res) => qrController.getOrderingPageByTableNumber(req, res);
export const downloadQRCode = (req, res) => qrController.downloadQRCode(req, res);
export const generateBrandedQR = (req, res) => qrController.generateBrandedQR(req, res);
export const getQRAnalytics = (req, res) => qrController.getQRAnalytics(req, res);

// Export class for advanced usage
export { QRController };

// Export default instance
export default qrController;