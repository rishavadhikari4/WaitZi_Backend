import mongoose from "mongoose";

const tableSchema = new mongoose.Schema({
  tableNumber: {
    type: Number,
    required: true,
    unique: true,
  },
  capacity: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: ['Available', 'Occupied', 'Reserved'],
    default: 'Available',
  },
  currentOrder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  assignedWaiter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});


tableSchema.index({ tableNumber: 1 });
tableSchema.index({ status: 1 });
tableSchema.index({ assignedWaiter: 1 });
tableSchema.index({ capacity: 1 });

export default mongoose.model('Table', tableSchema);
