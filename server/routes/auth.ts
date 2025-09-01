import express from 'express';
import { 
  login, 
  register, 
  getCurrentUser, 
  changePassword,
  authenticate,
  authorize 
} from '../middleware/auth';
import { authLimiter, strictLimiter } from '../middleware/security';
import db from '../database';

const router = express.Router();

// Apply strict rate limiting to auth endpoints
router.use(authLimiter);

// Public routes
router.post('/login', strictLimiter, login);

// Protected routes
router.use(authenticate); // All routes below require authentication

router.get('/me', getCurrentUser);
router.post('/change-password', changePassword);

// Admin-only routes
router.post('/register', authorize(['admin']), register);

// Get all users (admin only)
router.get('/users', authorize(['admin']), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, email, role, is_active, last_login, created_at 
      FROM users 
      ORDER BY created_at DESC
    `).all();
    
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      details: ['Internal server error']
    });
  }
});

// Deactivate user (admin only)
router.patch('/users/:id/deactivate', authorize(['admin']), (req, res) => {
  try {
    const { id } = req.params;
    
    if (id === req.user!.id) {
      return res.status(400).json({
        error: 'Cannot deactivate own account',
        details: ['You cannot deactivate your own account']
      });
    }
    
    const result = db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({
        error: 'User not found',
        details: ['User with the specified ID does not exist']
      });
    }
    
    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
    
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({
      error: 'Failed to deactivate user',
      details: ['Internal server error']
    });
  }
});

// Reactivate user (admin only)
router.patch('/users/:id/activate', authorize(['admin']), (req, res) => {
  try {
    const { id } = req.params;
    
    const result = db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(id);
    
    if (result.changes === 0) {
      return res.status(404).json({
        error: 'User not found',
        details: ['User with the specified ID does not exist']
      });
    }
    
    res.json({
      success: true,
      message: 'User reactivated successfully'
    });
    
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({
      error: 'Failed to reactivate user',
      details: ['Internal server error']
    });
  }
});

export default router;