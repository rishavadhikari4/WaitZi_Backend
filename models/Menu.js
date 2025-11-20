import mongoose from "mongoose";

const menuSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  image: {
    type: String,
  },
  description: {
    type: String,
    trim: true,
  },
  imageId: {
    type: String,
  },
  availabilityStatus: {
    type: String,
    enum: ['Available', 'Out of Stock'],
    default: 'Available',
  },
}, {
  timestamps: true,
});


menuSchema.index({ category: 1 });
menuSchema.index({ availabilityStatus: 1 });
menuSchema.index({ name: 1 });
menuSchema.index({ category: 1, availabilityStatus: 1 });
menuSchema.index({ price: 1 });

export default mongoose.model('Menu', menuSchema);
