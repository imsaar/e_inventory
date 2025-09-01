import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/gif'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed'));
    }
  }
});

// Single photo upload endpoint
router.post('/photo', (req, res) => {
  upload.single('photo')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.message });
      } else if (err.message) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: 'Upload failed' });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No photo file provided' });
      }

      // Return the file URL
      const photoUrl = `/uploads/${req.file.filename}`;
      res.json({ 
        success: true, 
        photoUrl,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (error) {
      console.error('Error uploading photo:', error);
      res.status(500).json({ error: 'Failed to upload photo' });
    }
  });
});

// Delete photo endpoint
router.delete('/photo', (req, res) => {
  try {
    const { photoUrl } = req.body;
    
    if (!photoUrl || !photoUrl.startsWith('/uploads/')) {
      return res.status(400).json({ error: 'Invalid photo URL' });
    }

    // Extract filename from URL
    const filename = path.basename(photoUrl);
    const filePath = path.join(uploadsDir, filename);

    // Check if file exists and delete it
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ success: true, message: 'Photo deleted successfully' });
    } else {
      res.status(404).json({ error: 'Photo file not found' });
    }
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

export default router;