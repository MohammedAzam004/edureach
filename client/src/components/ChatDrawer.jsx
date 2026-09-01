import { useState, useRef, useEffect } from "react";
import { X, Send, Bot, User, Minus, RotateCcw } from "lucide-react";
import { sendMessage } from "../services/chat.service.js";

const quickQuestions = [
  "What courses do you offer?",
  "Tell me about placements",
  "What is the fee structure?",
  "How to apply for admissions?",
];

const INITIAL_MESSAGE = {
  id: 1,
  text: `Hi there! I'm EduReach Bot. Ask me anything about courses, fees, admissions, or campus life.`,
  sender: "bot",
};

export default function ChatDrawer({ open, onClose }) {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async (text) => {
    const messageText = text || input.trim();
    if (!messageText || sending) return;

    const userMsg = { id: Date.now(), text: messageText, sender: "user" };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const data = await sendMessage(messageText);
      const botMsg = { id: Date.now() + 1, text: data.message, sender: "bot" };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      const errorText = err?.message || "Sorry, something went wrong. Please try again.";
      const errorMsg = { id: Date.now() + 1, text: errorText, sender: "bot" };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleReset = () => {
    setMessages([INITIAL_MESSAGE]);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatFormattedText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[540px] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-maroon px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">EduReach Bot</h3>
            <p className="text-white/70 text-xs">Ask me anything</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 1 && (
            <button
              onClick={handleReset}
              title="Reset conversation"
              className="text-white/70 hover:text-white p-1 transition-colors duration-200"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} title="Minimize" className="text-white/70 hover:text-white p-1 transition-colors duration-200">
            <Minus className="w-4 h-4" />
          </button>
          <button onClick={onClose} title="Close" className="text-white/70 hover:text-white p-1 transition-colors duration-200">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-end gap-2 ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
            {msg.sender === "bot" && (
              <div className="w-6 h-6 bg-maroon rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-3 h-3 text-white" />
              </div>
            )}
            <div className={`max-w-[84%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              msg.sender === "user"
                ? "bg-maroon text-white rounded-br-sm"
                : "bg-white text-gray-800 border border-gray-200 rounded-bl-sm shadow-sm"
            }`}>
              {formatFormattedText(msg.text)}
            </div>
            {msg.sender === "user" && (
              <div className="w-6 h-6 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                <User className="w-3 h-3 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex items-end gap-2">
            <div className="w-6 h-6 bg-maroon rounded-full flex items-center justify-center">
              <Bot className="w-3 h-3 text-white" />
            </div>
            <div className="bg-white border border-gray-200 px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm">
              <div className="flex gap-1.5 py-1">
                <span className="w-2 h-2 bg-maroon/60 rounded-full animate-bounce" />
                <span className="w-2 h-2 bg-maroon/60 rounded-full animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 bg-maroon/60 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick questions */}
      {messages.length === 1 && (
        <div className="px-3 py-2.5 bg-gray-50 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-2 font-medium">Quick questions:</p>
          <div className="flex flex-wrap gap-1.5">
            {quickQuestions.map((q) => (
              <button key={q} onClick={() => handleSend(q)}
                className="text-xs px-2.5 py-1 bg-white border border-maroon/20 text-maroon rounded-full hover:bg-maroon hover:text-white transition-colors duration-200">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border-t border-gray-200 p-3">
        <div className="flex items-center gap-2">
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ask a question..." disabled={sending}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-maroon text-sm disabled:opacity-50 transition-colors duration-200" />
          <button onClick={() => handleSend()} disabled={!input.trim() || sending}
            className="w-9 h-9 bg-maroon text-white rounded-lg flex items-center justify-center hover:bg-maroon-dark disabled:opacity-50 transition-colors duration-200">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
