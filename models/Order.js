import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Menu',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['Pending', 'Cooking', 'Ready', 'Served'],
    default: 'Pending',
  },
  notes: {
    type: String,
    trim: true,
  },
});

const orderSchema = new mongoose.Schema({
  table: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table',
    required: true,
  },
  customerName: {
    type: String,
    required: true,
    trim: true,
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: {
    type: Number,
    default: 0,
    min: 0,
  },
  finalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['Pending', 'InKitchen', 'Served', 'Cancelled', 'Paid', 'Completed'],
    default: 'Pending',
  },
  assignedWaiter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  orderTimeout: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
  },
  isTimedOut: {
    type: Boolean,
    default: false,
  },
  note: {
    type: String,
    trim: true,
  },
  cookedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  servedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});


orderSchema.index({ table: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ table: 1, status: 1 });
orderSchema.index({ "items.status": 1 });

orderSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.items.forEach(item => {
      item.subtotal = item.quantity * item.price;
    });

    this.totalAmount = this.items.reduce((sum, item) => sum + item.subtotal, 0);
    this.finalAmount = this.totalAmount - (this.discount || 0);
  }
  next();
});

orderSchema.methods.getOrderStats = function() {
  return {
    totalItems: this.items.length,
    totalQuantity: this.items.reduce((sum, item) => sum + item.quantity, 0),
    pendingItems: this.items.filter(item => item.status === 'Pending').length
  };
};

export default mongoose.model('Order', orderSchema);
