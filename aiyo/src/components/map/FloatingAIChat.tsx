'use client';

import { useState } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';

const quickReplies = [
  '推薦附近餐廳',
  '加一個咖啡廳',
  '調整交通方式',
  '修改行程順序',
];

interface MiniMessage {
  role: 'user' | 'ai';
  text: string;
}

export default function FloatingAIChat() {
  const { chatBubbleOpen, setChatBubbleOpen } = useUIStore();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<MiniMessage[]>([
    { role: 'ai', text: '嗨！需要我幫你調整行程嗎？😊' },
  ]);

  const handleSend = () => {
    if (!message.trim()) return;
    setMessages((prev) => [...prev, { role: 'user' as const, text: message }]);
    setMessage('');
    // Mock AI reply
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'ai' as const, text: '好的！讓我看看附近有什麼不錯的選擇... 🤔\n\n我推薦「% Arabica」咖啡廳，距離你下一個景點只有步行5分鐘！' },
      ]);
    }, 1200);
  };

  return (
    <div className="absolute bottom-6 right-6 z-30">
      <AnimatePresence>
        {chatBubbleOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="absolute bottom-16 right-0 w-80 bg-surface rounded-2xl shadow-soft-lg overflow-hidden border border-border-light"
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-lavender/10 border-b border-border-light">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-full bg-gradient-to-br from-primary to-lavender flex items-center justify-center">
                  <Sparkles className="size-3 text-white" />
                </div>
                <span className="text-sm font-semibold text-foreground">AI 助手</span>
                <div className="size-1.5 rounded-full bg-tertiary" />
              </div>
              <button
                onClick={() => setChatBubbleOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface/50 transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Messages */}
            <div className="h-64 overflow-y-auto p-3 flex flex-col gap-2.5">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-cream border border-border-light text-foreground rounded-bl-md'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Replies */}
            <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  onClick={() => {
                    setMessage(reply);
                  }}
                  className="px-2.5 py-1 bg-primary/8 text-primary text-[11px] rounded-full hover:bg-primary/15 transition-colors cursor-pointer"
                >
                  {reply}
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 bg-cream/50 rounded-xl border border-border-light px-3 py-1.5">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="輸入訊息..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-light focus:outline-none py-1"
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim()}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-30"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Bubble Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setChatBubbleOpen(!chatBubbleOpen)}
        className={`size-12 rounded-full shadow-soft-lg flex items-center justify-center cursor-pointer transition-colors ${
          chatBubbleOpen
            ? 'bg-primary text-white'
            : 'bg-surface text-primary hover:bg-primary/5 border border-border-light'
        }`}
      >
        {chatBubbleOpen ? (
          <X className="size-5" />
        ) : (
          <MessageCircle className="size-5" />
        )}
      </motion.button>
    </div>
  );
}
