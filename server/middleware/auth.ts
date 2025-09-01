import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import db from '../database';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        role: string;
      };
      db?: any; // Add db property for testing
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// User validation schemas
const loginSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username too long'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(100, 'Password too long')
});

const registerSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50, 'Username too long'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100, 'Password too long'),
  email: z.string().email('Invalid email address').optional(),
  role: z.enum(['admin', 'user']).default('user')
});

// Initialize users table
export const initializeUsersTable = () => {
  try {
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        username TEXT UNIQUE NOT NULL,
        email TEXT,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        is_active BOOLEAN DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    db.exec(createUsersTable);
    
    // Create default admin user if none exists
    const adminExists = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('admin') as { count: number };
    
    if (adminExists.count === 0) {
      console.log('Creating default admin user...');
      const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123456';
      const hashedPassword = bcrypt.hashSync(defaultPassword, 12);
      
      const stmt = db.prepare(`
        INSERT INTO users (username, password_hash, role, email) 
        VALUES (?, ?, ?, ?)
      `);
      
      stmt.run('admin', hashedPassword, 'admin', 'admin@example.com');
      console.log('Default admin user created. Username: admin, Password:', defaultPassword);
      console.log('IMPORTANT: Change the default password immediately!');
    }
    
    console.log('Users table initialized successfully');
  } catch (error) {
    console.error('Error initializing users table:', error);
    throw error;
  }
};

// Hash password utility
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 12);
};

// Verify password utility
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Generate JWT token
export const generateToken = (user: { id: string; username: string; role: string }): string => {
  const payload = { 
    id: user.id, 
    username: user.username, 
    role: user.role 
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

// Verify JWT token
export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Authentication middleware
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Authentication required',
        details: ['Please provide a valid authentication token']
      });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);
    
    // Get user from database to ensure they're still active
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id) as any;
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid user',
        details: ['User not found or inactive']
      });
    }
    
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role
    };
    
    next();
  } catch (error) {
    return res.status(401).json({
      error: 'Authentication failed',
      details: ['Invalid or expired token']
    });
  }
};

// Authorization middleware
export const authorize = (roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        details: ['User not authenticated']
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        details: [`This action requires one of the following roles: ${roles.join(', ')}`]
      });
    }
    
    next();
  };
};

// Login endpoint
export const login = async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues.map((err: any) => err.message)
      });
    }
    
    const { username, password } = validation.data;
    
    // Find user by username
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username) as any;
    
    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
        details: ['Username or password is incorrect']
      });
    }
    
    // Verify password
    const isValidPassword = await verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        details: ['Username or password is incorrect']
      });
    }
    
    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);
    
    // Generate token
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role
    });
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      details: ['An error occurred during login']
    });
  }
};

// Register endpoint (admin only)
export const register = async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Invalid input',
        details: validation.error.issues.map((err: any) => err.message)
      });
    }
    
    const { username, password, email, role } = validation.data;
    
    // Check if username already exists
    const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    
    if (existingUser) {
      return res.status(409).json({
        error: 'Username already exists',
        details: ['Please choose a different username']
      });
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Insert new user
    const stmt = db.prepare(`
      INSERT INTO users (username, password_hash, email, role) 
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(username, passwordHash, email || null, role);
    
    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user: {
        id: result.lastInsertRowid,
        username,
        email,
        role
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      details: ['An error occurred during registration']
    });
  }
};

// Get current user info
export const getCurrentUser = (req: Request, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Not authenticated',
      details: ['User not authenticated']
    });
  }
  
  const user = db.prepare('SELECT id, username, email, role, last_login, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  
  res.json({ user });
};

// Change password
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'Missing required fields',
        details: ['Current password and new password are required']
      });
    }
    
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'Invalid new password',
        details: ['New password must be at least 8 characters long']
      });
    }
    
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as any;
    
    const isValidPassword = await verifyPassword(currentPassword, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid current password',
        details: ['Current password is incorrect']
      });
    }
    
    const newPasswordHash = await hashPassword(newPassword);
    
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(newPasswordHash, req.user!.id);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      error: 'Failed to change password',
      details: ['An error occurred while changing password']
    });
  }
};