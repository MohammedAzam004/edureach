import express from "express";
import cors from "cors";
import chatRoutes from "./routes/chat.routes.js";
import errorHandler from "./middleware/error-handler.middleware.js";

const app = express();

// Middleware
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive fallback for public APIs
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "10mb" }));

// Health check routes for cloud deployments
app.get("/", (req, res) => {
  res.json({ success: true, message: "EduReach Chatbot API is running", timestamp: new Date().toISOString() });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/chat", chatRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found." });
});

// Global error handler (must be last)
app.use(errorHandler);

export default app;

