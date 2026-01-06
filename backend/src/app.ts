import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import userRoutes from './routes/user.routes';
import { errorHandler } from './middleware/errorHandler';

// Load environment variables
dotenv.config();

const app: Application = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (req: Request, res: Response) => {
  res.json({ message: 'Express + TypeScript Server' });
});

// API Routes
app.use('/api/users', userRoutes);

// Error handling middleware
app.use(errorHandler);

// Start server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
}); 