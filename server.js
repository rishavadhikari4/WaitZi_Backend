import http from "http";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectDB from "./config/dbConfig.js";
import routes from "./routes/index.js";
import { initializeAdminRole } from "./controller/roleController.js";
import { initializeTimeoutManager, cleanupTimeouts } from "./utils/orderTimeoutManager.js";
import { initializeSocket } from "./utils/socket.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Trust proxy for rate limiting and correct IP detection when behind reverse proxy
app.set('trust proxy', true);

// Support multiple frontend origins (comma-separated in FRONTEND_URL env var)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(url => url.trim());

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

const PORT = 5000;

// Initialize application
const startServer = async () => {
    try {
        // Connect to database first
        await connectDB();
        console.log('📊 Database connected successfully');
        
        // Initialize essential roles (including admin)
        await initializeAdminRole();
        
        // Initialize order timeout manager
        await initializeTimeoutManager();
        console.log('⏰ Order timeout manager initialized');
        
        // Setup routes
        app.use('/api', routes);

        // Initialize Socket.IO
        initializeSocket(server, allowedOrigins);

        // Start server based on environment
        if (isProduction) {
            server.listen(PORT, () => {
                console.log(`🚀 Production server running on port ${PORT}`);
                console.log(`📊 Environment: ${process.env.NODE_ENV}`);
                console.log(`🔗 Server URL: ${process.env.FRONTEND_URL || 'Not configured'}`);
                console.log(`🗄️  MongoDB: Connected to production database`);
                console.log(`🔒 Security: Production mode enabled`);
                console.log(`👑 Admin role: Initialized and ready`);
            });
        } else if (isDevelopment) {
            server.listen(PORT, '0.0.0.0', () => {
                console.log(`🚀 Development server running on http://localhost:${PORT}`);
                console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`🌐 Network access: http://0.0.0.0:${PORT}`);
                console.log(`🔗 Local access: http://localhost:${PORT}`);
                console.log(`📡 API Routes: http://localhost:${PORT}/api`);
                console.log(`👑 Admin role: Initialized and ready`);
                console.log(`🛠️  Development features enabled`);
            });
        } else {
            server.listen(PORT, () => {
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

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('🔄 SIGTERM received, shutting down gracefully...');
    cleanupTimeouts();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🔄 SIGINT received, shutting down gracefully...');
    cleanupTimeouts();
    process.exit(0);
});
