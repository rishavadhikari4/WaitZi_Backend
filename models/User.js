import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true,
  },
  lastName: {
    type: String,
    required: true,
    trim: true,
  },
  address: {
    type: String,
    required: true,
  },
  number: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  image: {
    type: String,
    default: "https://res.cloudinary.com/de1lvlqme/image/upload/v1749566197/vecteezy_default-profile-account-unknown-icon-black-silhouette_20765399_ldtak0.jpg"
  },
  imageId: {
    type: String,
    default: null
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true,
    index: true, // Create index for queries
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active',
    index: true, // Create index for filtering
  },
}, {
  timestamps: true,
});

// Only add indexes that aren't already created by field definitions
userSchema.index({ firstName: 1, lastName: 1 }); // Compound index for name searches

export default mongoose.model('User', userSchema);
