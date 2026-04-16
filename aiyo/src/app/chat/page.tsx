'use client';

import { useState } from 'react';
import { mockChatMessages } from '@/lib/mock-data';
import type { ChatMessage } from '@/lib/types';
import { motion } from 'framer-motion';
import {
  Send,
  Mic,
  Sparkles,
  MapPin,
  CalendarDays,
  DollarSign,
  Heart,
  Zap,
  Loader2,
} from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';

const extractedTags = [
  { icon: MapPin, label: '目的地', value: '東京', color: 'bg-secondary/10 text-secondary' },
  { icon: CalendarDays, label: '天數', value: '5天4夜', color: 'bg-primary/10 text-primary' },
  { icon: DollarSign, label: '預算', value: 'NT$50,000', color: 'bg-tertiary/10 text-foreground' },
  { icon: Heart, label: '興趣', value: '動漫・美食', color: 'bg-lavender/10 text-lavender' },
  { icon: Zap, label: '步調', value: '輕鬆舒適', color: 'bg-peach/30 text-foreground' },
];

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(mockChatMessages);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const { voiceState, setVoiceState } = useUIStore();

  const handleSend = () => {
    if (!input.trim()) return;
    const newMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((prev) => [...prev, newMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const aiReply: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: 'ai',
        content: '了解你的需求！我正在調整行程安排，你可以到行程管理頁面查看更新後的內容。有其他想法也歡迎繼續告訴我 😊',
        timestamp: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiReply]);
      setIsTyping(false);
    }, 1500);
  };

  const handleVoiceToggle = () => {
    if (voiceState === 'idle') {
      setVoiceState('listening');
      setTimeout(() => {
        setVoiceState('idle');
        setInput('我想在 Day 3 加入一間拉麵店');
      }, 3000);
    } else {
      setVoiceState('idle');
    }
  };

  return (
    <div className="h-screen flex">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-light">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-lavender to-primary flex items-center justify-center">
              <Sparkles className="size-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">AI 旅遊對話</h1>
              <p className="text-xs text-muted">語音規劃為主，文字對話為輔</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">
          {messages.map((msg, i) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex items-end gap-2 max-w-[70%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div
                  className={`size-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${
                    msg.role === 'ai'
                      ? 'bg-gradient-to-br from-lavender to-primary'
                      : 'bg-gradient-to-br from-secondary to-primary'
                  }`}
                >
                  {msg.role === 'ai' ? '✨' : '你'}
                </div>

                <div>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-br-md'
                        : 'bg-surface border border-border-light text-foreground rounded-bl-md shadow-soft'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                  <p className={`text-[10px] text-muted mt-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                    {msg.timestamp}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2"
            >
              <div className="size-8 rounded-full bg-gradient-to-br from-lavender to-primary flex items-center justify-center text-xs">
                ✨
              </div>
              <div className="px-4 py-3 bg-surface border border-border-light rounded-2xl rounded-bl-md shadow-soft">
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-muted-light animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="size-2 rounded-full bg-muted-light animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="size-2 rounded-full bg-muted-light animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Voice Listening State */}
        {voiceState === 'listening' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="px-6 pb-2 flex justify-center"
          >
            <div className="flex items-center gap-3 px-5 py-3 bg-lavender/10 rounded-2xl border border-lavender/20">
              <div className="flex items-end gap-0.5 h-5">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-lavender rounded-full"
                    animate={{ height: [6, 20, 6] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.08, ease: 'easeInOut' }}
                  />
                ))}
              </div>
              <span className="text-sm font-medium text-lavender">正在聆聽...</span>
            </div>
          </motion.div>
        )}

        {/* Input Area */}
        <div className="px-6 pb-6 pt-3">
          <div className="flex items-center gap-3 bg-surface rounded-2xl border border-border-light shadow-soft px-4 py-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleVoiceToggle}
              className={`size-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                voiceState === 'listening'
                  ? 'bg-lavender text-white'
                  : 'bg-lavender/10 text-lavender hover:bg-lavender/20'
              }`}
            >
              {voiceState === 'listening' ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Mic className="size-5" />
              )}
            </motion.button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="描述你的旅遊需求..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-light focus:outline-none py-2"
            />

            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="size-10 rounded-xl bg-primary text-white flex items-center justify-center cursor-pointer hover:bg-primary-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - AI Preferences */}
      <div className="w-72 border-l border-border-light bg-surface/50 p-5 overflow-y-auto hidden lg:block">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="size-4 text-lavender" />
          AI 理解的條件
        </h3>

        <div className="flex flex-col gap-3">
          {extractedTags.map((tag) => {
            const Icon = tag.icon;
            return (
              <div
                key={tag.label}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${tag.color}`}
              >
                <Icon className="size-4 flex-shrink-0" />
                <div>
                  <p className="text-[11px] text-muted">{tag.label}</p>
                  <p className="text-sm font-medium">{tag.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* AI Summary Card */}
        <div className="mt-6 p-4 bg-gradient-to-br from-lavender/10 to-primary/10 rounded-2xl border border-lavender/15">
          <h4 className="text-sm font-semibold text-foreground mb-2">🎯 旅遊摘要</h4>
          <p className="text-xs text-muted leading-relaxed">
            以美食與動漫為主題的東京五日輕鬆遊。預算控制在五萬台幣內，以地鐵為主要交通方式，每天安排3-4個主要景點。
          </p>
        </div>
      </div>
    </div>
  );
}
