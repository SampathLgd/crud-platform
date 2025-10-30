import express = require('express'); // <-- ADD THIS LINE
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'YOUR_SUPER_SECRET_KEY'; // Must be same as in auth.controller.ts

// Define a new interface for requests that have a user object
interface AuthRequest extends express.Request { // <-- This will now work
  user?: { id: number; role: string };
}

// Middleware to protect routes
exports.protect = (req: AuthRequest, res: express.Response, next: express.NextFunction) => { // <-- Types updated
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).send('Not authorized, no token');
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; role: string };
    
    // Attach user to the request object
    req.user = decoded; 
    next();
  } catch (error) {
    res.status(401).send('Not authorized, token failed');
  }
};

// Middleware to restrict routes to certain roles
exports.authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: express.Response, next: express.NextFunction) => { // <-- Types updated
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).send('Forbidden: You do not have permission');
    }
    next();
  };
};

