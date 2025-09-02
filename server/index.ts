import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import { initializeDatabase } from './database';
import { initializeUsersTable } from './middleware/auth';
import componentRoutes from './routes/components';
import locationRoutes from './routes/locations';
import projectRoutes from './routes/projects';
import authRoutes from './routes/auth';
import uploadRoutes from './routes/uploads';
import databaseRoutes from './routes/database';
import orderRoutes from './routes/orders';
import { 
  securityHeaders, 
  generalLimiter, 
  corsOptions, 
  securityLogger, 
  requestSizeLimit,
  secureErrorHandler
} from './middleware/security';
import { sanitizeStrings } from './middleware/validation';

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware (applied first)
app.use(securityHeaders);
app.use(securityLogger);
app.use(generalLimiter);
app.use(requestSizeLimit);

// Session configuration for CSRF protection
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// CORS with proper configuration
app.use(cors(corsOptions));

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sanitize all string inputs
app.use(sanitizeStrings);

// Serve uploaded images with proper security headers
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
  maxAge: '1d',
  setHeaders: (res, filePath) => {
    // Prevent script execution in uploads directory
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    
    // Only allow known image types
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const ext = path.extname(filePath).toLowerCase();
    if (!allowedTypes.includes(ext)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  }
}));

// Initialize database and authentication
try {
  initializeDatabase();
  initializeUsersTable();
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

// API Routes
app.use('/api/auth', authRoutes); // Authentication routes (public)
app.use('/api/components', componentRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/database', databaseRoutes);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Handle 404s
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    details: [`Endpoint ${req.method} ${req.originalUrl} not found`]
  });
});

// Global error handler (must be last)
app.use(secureErrorHandler);

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

export default app;