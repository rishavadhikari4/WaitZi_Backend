import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  table: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Table',
  },
  amount: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'Fonepay', 'NepalPay', 'Khalti'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['Paid', 'Pending', 'Failed', 'Refunded'],
    default: 'Pending',
  },
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  transactionId: {
    type: String,
    trim: true,
  },
  khaltiPidx: {
    type: String,
    trim: true,
  },
  paymentTime: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});


paymentSchema.index({ order: 1 });
paymentSchema.index({ paymentStatus: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ transactionId: 1 }, { sparse: true });
paymentSchema.index({ paymentTime: -1 });
paymentSchema.index({ table: 1, paymentStatus: 1 });
paymentSchema.index({ khaltiPidx: 1 }, { sparse: true });

export default mongoose.model('Payment', paymentSchema);
