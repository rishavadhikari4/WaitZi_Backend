import express from "express";
import connectDB from "./config/dbConfig.js";
import routes from "./routes/index.js";
import { initializeAdminRole } from "./controller/roleController.js";

const app = express();

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

app.use(express.json());

const PORT = 5000;

// Initialize application
const startServer = async () => {
    try {
        // Connect to database first
        await connectDB();
        console.log('📊 Database connected successfully');
        
        // Initialize essential roles (including admin)
        await initializeAdminRole();
        
        // Setup routes
        app.use('/api', routes);

        // Start server based on environment
        if (isProduction) {
            app.listen(PORT, () => {
                console.log(`🚀 Production server running on port ${PORT}`);
                console.log(`📊 Environment: ${process.env.NODE_ENV}`);
                console.log(`🔗 Server URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
                console.log(`🗄️  MongoDB: Connected to production database`);
                console.log(`🔒 Security: Production mode enabled`);
                console.log(`👑 Admin role: Initialized and ready`);
            });
        } else if (isDevelopment) {
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`🚀 Development server running on http://localhost:${PORT}`);
                console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`🌐 Network access: http://0.0.0.0:${PORT}`);
                console.log(`🔗 Local access: http://localhost:${PORT}`);
                console.log(`📡 API Routes: http://localhost:${PORT}/api`);
                console.log(`👑 Admin role: Initialized and ready`);
                console.log(`🛠️  Development features enabled`);
            });
        } else {
            app.listen(PORT, () => {
                console.log(`🚀 Server running on port ${PORT}`);
                console.log(`👑 Admin role: Initialized and ready`);
            });
        }
    } catch (error) {
        console.error('❌ Failed to start server:', error.message);
        process.exit(1);
    }
};

startServer();
