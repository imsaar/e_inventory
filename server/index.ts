import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeDatabase } from './database';
import componentRoutes from './routes/components';
import locationRoutes from './routes/locations';
import projectRoutes from './routes/projects';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Initialize database
try {
  initializeDatabase();
  console.log('Database initialized successfully');
} catch (error) {
  console.error('Failed to initialize database:', error);
  process.exit(1);
}

// API Routes
app.use('/api/components', componentRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/projects', projectRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;