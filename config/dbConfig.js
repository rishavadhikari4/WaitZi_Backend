import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config(); 

let mongo_uri;

if(process.env.NODE_ENV === 'development'){
  mongo_uri = process.env.DEVELOPMENT_MONGO_URI;
} else if(process.env.NODE_ENV === 'production'){
  mongo_uri = process.env.PRODUCTION_MONGO_URI;
} else {
  mongo_uri = process.env.MONGO_URI;
}

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(mongo_uri || process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4 
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
};

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed due to app termination');
  process.exit(0);
});

export default connectDB;
