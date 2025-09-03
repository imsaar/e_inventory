import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Allow file uploads
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
});

// Rate limiting configurations
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 10000, // More lenient in development
  message: {
    error: 'Too many requests from this IP',
    details: ['Please try again later']
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs for sensitive endpoints
  message: {
    error: 'Rate limit exceeded for this endpoint',
    details: ['Please try again later']
  },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 authentication attempts per windowMs
  message: {
    error: 'Too many authentication attempts',
    details: ['Account temporarily locked. Try again later.']
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// CORS configuration
export const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Replace with actual production domain
    : ['http://localhost:5173', 'http://localhost:5174'], // Development origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With', 
    'Content-Type',
    'Accept',
    'Authorization',
    'X-CSRF-Token'
  ],
  maxAge: 86400 // 24 hours
};

// Request logging for security monitoring
export const securityLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  
  // Log potentially suspicious requests
  const suspiciousPatterns = [
    /[<>'"]/,  // Potential XSS
    /union|select|insert|update|delete|drop|create|alter/i, // SQL keywords
    /\.\.|\/\.\./,  // Path traversal
    /%[0-9a-f]{2}/i  // URL encoding
  ];
  
  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(req.url) || 
    pattern.test(JSON.stringify(req.body || {})) ||
    pattern.test(JSON.stringify(req.query || {}))
  );
  
  if (isSuspicious) {
    console.warn(`[SECURITY] Suspicious request from ${req.ip}:`, {
      method: req.method,
      url: req.url,
      userAgent: req.get('User-Agent'),
      body: req.body,
      query: req.query,
      timestamp: new Date().toISOString()
    });
  }
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    
    // Log failed requests (potential attacks)
    if (res.statusCode >= 400) {
      console.warn(`[SECURITY] Failed request from ${req.ip}:`, {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      });
    }
  });
  
  next();
};

// Request size limiting to prevent DoS
export const requestSizeLimit = (req: Request, res: Response, next: NextFunction) => {
  const contentLength = parseInt(req.get('Content-Length') || '0');
  const maxSize = 10 * 1024 * 1024; // 10MB limit
  
  if (contentLength > maxSize) {
    return res.status(413).json({
      error: 'Request entity too large',
      details: ['Maximum request size is 10MB']
    });
  }
  
  next();
};

// IP whitelisting for admin endpoints (if needed)
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    
    if (!allowedIPs.includes(clientIP) && !allowedIPs.includes('0.0.0.0')) {
      console.warn(`[SECURITY] Blocked request from non-whitelisted IP: ${clientIP}`);
      return res.status(403).json({
        error: 'Access forbidden',
        details: ['Your IP address is not authorized']
      });
    }
    
    next();
  };
};

// Generic error handler that doesn't leak information
export const secureErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(`[ERROR] ${err.stack || err.message}`, {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  // Don't expose sensitive error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  res.status(err.status || 500).json({
    error: isDevelopment ? err.message : 'Internal server error',
    details: isDevelopment ? [err.stack] : ['An error occurred. Please try again later.']
  });
};

// CSRF protection token generation (simple implementation)
export const csrfToken = (req: Request, res: Response, next: NextFunction) => {
  if (!req.session) {
    return next(); // Skip if no session configured
  }
  
  if (!(req.session as any).csrfToken) {
    (req.session as any).csrfToken = require('crypto').randomBytes(32).toString('hex');
  }
  
  next();
};

// CSRF token validation
export const validateCSRF = (req: Request, res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next(); // Skip CSRF for safe methods
  }
  
  const sessionToken = (req.session as any)?.csrfToken;
  const requestToken = req.get('X-CSRF-Token') || req.body._csrf;
  
  if (!sessionToken || sessionToken !== requestToken) {
    return res.status(403).json({
      error: 'CSRF token validation failed',
      details: ['Invalid or missing CSRF token']
    });
  }
  
  next();
};