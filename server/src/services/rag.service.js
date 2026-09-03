import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { TextLoader } from "@langchain/classic/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// ---- __dirname for ESM ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KNOWLEDGE_FILE_PATH = path.join(__dirname, "../../knowledge-base/edureach-knowledge.txt");

// ---- MongoDB native client ----
let mongoClient = null;

const getMongoClient = async () => {
  if (!mongoClient) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error(
        "MONGODB_URI is not set in .env! Set a valid connection string starting with 'mongodb://' or 'mongodb+srv://'"
      );
    }
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
  }
  return mongoClient;
};

// ---- Google GenAI Embeddings ----
const getEmbeddings = () => {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not set in .env!");
  }
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "text-embedding-004",
  });
};

// ---- Vector Store ----
const getVectorStore = async () => {
  const client = await getMongoClient();
  const collection = client.db("edureach_db").collection("knowledge_docs");

  return new MongoDBAtlasVectorSearch(getEmbeddings(), {
    collection: collection,
    indexName: "edureach_vector_index",
    textKey: "text",
    embeddingKey: "embedding",
  });
};

// ============================================
// A) LOCAL KNOWLEDGE BASE FALLBACK ENGINE
// ============================================
const getLocalKnowledgeSections = () => {
  try {
    if (!fs.existsSync(KNOWLEDGE_FILE_PATH)) {
      return [];
    }
    const rawText = fs.readFileSync(KNOWLEDGE_FILE_PATH, "utf-8");
    const blocks = rawText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    return blocks;
  } catch (err) {
    console.error("[RAG] Failed to read local knowledge file:", err.message);
    return [];
  }
};

export const getLocalKnowledgeContext = (question) => {
  const blocks = getLocalKnowledgeSections();
  if (blocks.length === 0) return "";

  const qLower = question.toLowerCase();
  const words = qLower.split(/\s+/).filter((w) => w.length > 2);

  const scoredBlocks = blocks.map((block) => {
    const blockLower = block.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (blockLower.includes(word)) {
        score += 1;
      }
    }
    // High-priority topic keyword boosting
    if ((qLower.includes("course") || qLower.includes("program") || qLower.includes("b.tech") || qLower.includes("m.tech") || qLower.includes("branch")) && blockLower.includes("courses offered")) score += 10;
    if ((qLower.includes("fee") || qLower.includes("cost") || qLower.includes("hostel") || qLower.includes("scholarship") || qLower.includes("tuition") || qLower.includes("installment")) && blockLower.includes("fee structure")) score += 10;
    if ((qLower.includes("admiss") || qLower.includes("apply") || qLower.includes("eamcet") || qLower.includes("eligib") || qLower.includes("document") || qLower.includes("quota")) && blockLower.includes("admissions process")) score += 10;
    if ((qLower.includes("place") || qLower.includes("package") || qLower.includes("salary") || qLower.includes("company") || qLower.includes("recruiter") || qLower.includes("highest")) && blockLower.includes("placement statistics")) score += 10;
    if ((qLower.includes("mentor") || qLower.includes("faculty") || qLower.includes("prof") || qLower.includes("teacher") || qLower.includes("head")) && blockLower.includes("popular mentors")) score += 10;
    if ((qLower.includes("campus") || qLower.includes("fest") || qLower.includes("club") || qLower.includes("sport") || qLower.includes("library") || qLower.includes("bus")) && blockLower.includes("campus life")) score += 10;
    if ((qLower.includes("faq") || qLower.includes("dress") || qLower.includes("gate") || qLower.includes("incubator")) && blockLower.includes("frequently asked questions")) score += 10;

    return { block, score };
  });

  scoredBlocks.sort((a, b) => b.score - a.score);
  const topBlocks = scoredBlocks.filter((item) => item.score > 0).slice(0, 3);

  if (topBlocks.length === 0) {
    return blocks.slice(0, 2).join("\n\n");
  }

  return topBlocks.map((item) => item.block).join("\n\n");
};

// ============================================
// B) INDEXING — runs ONCE at server startup
// ============================================
export const initializeKnowledgeBase = async () => {
  try {
    const client = await getMongoClient();
    const collection = client.db("edureach_db").collection("knowledge_docs");

    const docWithEmbedding = await collection.findOne({
      embedding: { $exists: true, $not: { $size: 0 } },
    });

    if (docWithEmbedding) {
      console.log(" Knowledge base already indexed in MongoDB — skipping.");
      return;
    }

    await collection.deleteMany({});
    console.log(" Indexing knowledge base into MongoDB Atlas Vector Search...");

    const embeddings = getEmbeddings();
    const testResult = await embeddings.embedQuery("test");
    console.log(` API key OK — embedding dimensions: ${testResult.length}`);

    const loader = new TextLoader(KNOWLEDGE_FILE_PATH);
    const docs = await loader.load();
    if (docs.length === 0) {
      throw new Error("No documents found in knowledge base file");
    }

    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const allSplits = await splitter.splitDocuments(docs);
    console.log(`    Split into ${allSplits.length} chunks`);

    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
      collection: collection,
      indexName: "edureach_vector_index",
      textKey: "text",
      embeddingKey: "embedding",
    });

    await vectorStore.addDocuments(allSplits);
    console.log(`    ${allSplits.length} chunks stored in MongoDB.`);
  } catch (error) {
    console.warn(`[KnowledgeBase Init] Warning: ${error.message}`);
    console.warn("EduReach Bot will use local knowledge base file fallback when needed.");
  }
};

// ============================================
// C) RAG & FALLBACK RESPONSE ENGINE
// ============================================
export const getRAGResponse = async (question) => {
  const hasApiKey = Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim());

  // --- Tier 1: Try Cloud RAG via MongoDB Atlas Vector Search & Gemini ---
  if (hasApiKey && process.env.MONGODB_URI) {
    try {
      const vectorStore = await getVectorStore();
      const retrievedDocs = await vectorStore.similaritySearch(question, 3);

      if (retrievedDocs.length > 0) {
        const context = retrievedDocs.map((doc) => doc.pageContent).join("\n\n");
        const model = new ChatGoogleGenerativeAI({
          model: "gemini-1.5-flash",
          temperature: 0.7,
          apiKey: process.env.GOOGLE_API_KEY,
        });

        const result = await model.invoke([
          {
            role: "system",
            content: `You are EduReach Bot, the official AI assistant for EduReach College, Hyderabad. Provide accurate, helpful, friendly responses based on this context:\n\n${context}`,
          },
          { role: "user", content: question },
        ]);

        return result.content;
      }
    } catch (err) {
      console.warn(`[RAG Cloud Vector Search] Failed: ${err.message}. Falling back to Tier 2 (Local context + Gemini).`);
    }
  }

  // --- Tier 2: Try Gemini LLM using local text retrieval ---
  if (hasApiKey) {
    try {
      const localContext = getLocalKnowledgeContext(question);
      const model = new ChatGoogleGenerativeAI({
        model: "gemini-1.5-flash",
        temperature: 0.7,
        apiKey: process.env.GOOGLE_API_KEY,
      });

      const result = await model.invoke([
        {
          role: "system",
          content: `You are EduReach Bot, the official AI assistant for EduReach College, Hyderabad. Answer concisely and accurately based on the college information below. Use clean bullet points and clear formatting.\n\nCollege Information:\n${localContext}`,
        },
        { role: "user", content: question },
      ]);

      return result.content;
    } catch (err) {
      console.warn(`[RAG Gemini Call] Failed: ${err.message}. Falling back to Tier 3 (Local Knowledge Engine).`);
    }
  }

  // --- Tier 3: Direct Local Knowledge Base Search & Formatting Engine ---
  const localContext = getLocalKnowledgeContext(question);
  if (!localContext) {
    return "I'm EduReach Bot! For detailed inquiries, please contact our admissions office at admissions@edureach.edu.in or call +91-9876543210.";
  }

  return formatLocalResponse(question, localContext);
};

// Formats local text block nicely into user-friendly response when Gemini key is not set
function formatLocalResponse(question, rawContext) {
  const qLower = question.toLowerCase();

  if (qLower.includes("course") || qLower.includes("program") || qLower.includes("offer") || qLower.includes("b.tech") || qLower.includes("branch")) {
    return `Here are the academic programs offered at EduReach College:

🎓 **B.Tech Programs (4 Years):**
• **CSE (Computer Science & Engg):** 180 seats (Avg package: ₹10.2 LPA)
• **ECE (Electronics & Communication):** 120 seats (Avg package: ₹7.2 LPA)
• **AI & DS (Artificial Intelligence & Data Science):** 60 seats (Avg package: ₹11.5 LPA)
• **IT (Information Technology):** 120 seats (Avg package: ₹8.8 LPA)
• **ME (Mechanical Engg):** 60 seats (Avg package: ₹5.5 LPA)
• **CE (Civil Engg):** 60 seats (Avg package: ₹5.0 LPA)

🎓 **M.Tech Programs (2 Years):**
• Computer Science (30 seats) | VLSI Design (18 seats) | Structural Engineering (18 seats)

🎓 **MBA Program (2 Years):**
• MBA with Finance, Marketing, HR & IT specializations (60 seats, Avg: ₹8.0 LPA)`;
  }

  if (qLower.includes("fee") || qLower.includes("cost") || qLower.includes("hostel") || qLower.includes("scholarship") || qLower.includes("tuition")) {
    return `Here is the fee structure for 2024–2025 at EduReach College:

💰 **Annual Fee Breakdown:**
• **B.Tech Tuition Fee:** ₹1,50,000 / year
• **Hostel Fee (AC/Non-AC + Mess):** ₹80,000 / year
• **Lab & Exam Fees:** ₹20,000 / year
• **Day Scholar Total:** ₹1,70,000 / year
• **Hosteller Total:** ₹2,50,000 / year

🌟 **Scholarships & Financial Support:**
• **Merit Scholarship:** Top 10 rankers get a 50% tuition waiver.
• **Need-based & Sports Scholarships:** Up to 100% waiver / 25% waiver for state/national athletes.
• **Payment:** 2 installments per year. Education loans available via SBI, HDFC, ICICI.`;
  }

  if (qLower.includes("place") || qLower.includes("package") || qLower.includes("salary") || qLower.includes("company") || qLower.includes("recruiter")) {
    return `Here are the placement highlights for EduReach College (2023–2024):

🚀 **Key Placement Stats:**
• **Placement Rate:** 92%
• **Highest Package:** ₹42 LPA (Google)
• **Average Package:** ₹8.5 LPA | **Median:** ₹6.5 LPA
• **Total Offers:** 850+ | **Visiting Companies:** 150+

🏢 **Top Recruiters:**
Google, Microsoft, Amazon, TCS, Infosys, Wipro, Deloitte, Flipkart, Accenture, Razorpay, CRED, PhonePe, and more!`;
  }

  if (qLower.includes("apply") || qLower.includes("admiss") || qLower.includes("eamcet") || qLower.includes("eligib") || qLower.includes("document")) {
    return `Here is the admission process for EduReach College:

📋 **Admission Pathways:**
• **B.Tech:** 70% seats via TS EAMCET / AP EAMCET counseling. 30% Management Quota (10+2 PCM min 60%). JEE Main holders preferred.
• **M.Tech:** 50% GATE score / 50% College Entrance Test.
• **MBA:** 70% TS ICET / 30% Management Quota.

🗓️ **Key Dates & Contact:**
• Applications open **March 1st**.
• Management Quota deadline **July 15th**.
• Contact admissions: **admissions@edureach.edu.in** | **+91-9876543210**`;
  }

  return rawContext;
}
