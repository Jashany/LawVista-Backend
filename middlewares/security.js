import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import { body, validationResult } from 'express-validator';

// General rate limiting
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        success: false
    },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Strict rate limiting for authentication endpoints
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 5 requests per windowMs for auth endpoints
    message: {
        error: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful requests
});

// Password reset rate limiting
export const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 password reset requests per hour
    message: {
        error: 'Too many password reset attempts from this IP, please try again after 1 hour.',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Chat/AI endpoint rate limiting
export const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 50, // limit each IP to 10 chat requests per minute
    message: {
        error: 'Too many chat requests, please slow down.',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Upload endpoint rate limiting
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // limit each IP to 50 upload requests per hour
    message: {
        error: 'Too many upload requests from this IP, please try again later.',
        success: false
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Speed limiter - slows down requests after threshold
export const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // allow 50 requests per 15 minutes, then...
    delayMs: 500, // begin adding 500ms of delay per request above 50
    maxDelayMs: 20000, // maximum delay of 20 seconds
});

// Helmet configuration for security headers
export const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false, // Disable if using CORS
});

// Input validation middleware
export const validateRegister = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name can only contain letters and spaces'),
    
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
];

export const validateLogin = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
];

export const validatePasswordReset = [
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
];

export const validateForgotPassword = [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email'),
];

export const validateChat = [
    body('userMessage')
        .trim()
        .isLength({ min: 1, max: 2000 })
        .withMessage('Message must be between 1 and 2000 characters')
        .escape(), // Escape HTML entities
];

export const validateNotebookTitle = [
    body('title')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Title must be between 1 and 100 characters')
        .escape(),
];

// Validation result handler
export const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array()
        });
    }
    next();
};

// MongoDB injection protection
export const mongoSanitizer = mongoSanitize({
    replaceWith: '_', // Replace prohibited characters with underscore
});

// HPP (HTTP Parameter Pollution) protection
export const hppProtection = hpp({
    whitelist: ['tags', 'categories'] // Allow arrays for specific parameters if needed
});

// Custom security headers
export const customSecurityHeaders = (req, res, next) => {
    // Remove powered by Express header
    res.removeHeader('X-Powered-By');
    
    // Add custom security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    
    next();
};

// Request size limiter
export const requestSizeLimiter = (req, res, next) => {
    const contentLength = parseInt(req.get('Content-Length'));
    const maxSize = 10 * 1024 * 1024; // 10MB limit
    
    if (contentLength && contentLength > maxSize) {
        return res.status(413).json({
            success: false,
            message: 'Request too large. Maximum size allowed is 10MB.'
        });
    }
    
    next();
};

// IP whitelisting middleware (optional - configure as needed)
export const ipWhitelist = (allowedIPs = []) => {
    return (req, res, next) => {
        if (allowedIPs.length === 0) {
            return next(); // Skip if no IPs specified
        }
        
        const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        
        if (!allowedIPs.includes(clientIP)) {
            return res.status(403).json({
                success: false,
                message: 'Access forbidden from this IP address.'
            });
        }
        
        next();
    };
};

// CORS configuration
export const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5173',
            'http://localhost:3001',
            // Add your production domains here
        ];
        
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
};

// Request logging middleware for security monitoring
export const securityLogger = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const method = req.method;
    const url = req.originalUrl;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    // Log suspicious activities
    const suspiciousPatterns = [
        /\.\./,           // Path traversal
        /<script/i,       // XSS attempts
        /union.*select/i, // SQL injection attempts
        /javascript:/i,   // JavaScript injection
        /eval\(/i,        // Code execution attempts
    ];
    
    const isSuspicious = suspiciousPatterns.some(pattern => 
        pattern.test(url) || pattern.test(JSON.stringify(req.body))
    );
    
    if (isSuspicious) {
        console.warn(`🚨 SUSPICIOUS REQUEST: ${timestamp} | IP: ${ip} | ${method} ${url} | User-Agent: ${userAgent}`);
    } else {
        console.log(`📝 REQUEST: ${timestamp} | IP: ${ip} | ${method} ${url} `);
    }
    
    next();
};

// Error handling middleware for security
export const securityErrorHandler = (err, req, res, next) => {
    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production') {
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
    
    // Log the error for debugging
    console.error('Security Error:', err);
    
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};
