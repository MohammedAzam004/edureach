import app from "./app.js";
import { initializeKnowledgeBase } from "./services/rag.service.js";

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    // Start listening immediately so cloud platforms (Render, Railway) detect the open port
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Run knowledge base indexing asynchronously in background
    if (process.env.GOOGLE_API_KEY && process.env.MONGODB_URI) {
      initializeKnowledgeBase().catch((err) => {
        console.warn("[KnowledgeBase] Background init warning:", err.message);
      });
    } else {
      console.log(
        "Skipping MongoDB knowledge-base indexing (GOOGLE_API_KEY or MONGODB_URI not set). Using local knowledge base fallback."
      );
    }
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
