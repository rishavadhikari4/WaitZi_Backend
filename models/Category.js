import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },
  description: {
    type: String,
    trim: true,
  },
  image: {
    type: String,
  },
  imageId: {
    type: String,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, {
  timestamps: true,
});


categorySchema.index({ name: 1 });
categorySchema.index({ isActive: 1 });

export default mongoose.model('Category', categorySchema);
