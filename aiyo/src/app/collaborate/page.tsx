'use client';

import { useState } from 'react';
import { useCollabStore } from '@/stores/useCollabStore';
import { motion } from 'framer-motion';
import {
  Users,
  Copy,
  Check,
  Link2,
  Shield,
  Eye,
  Pencil,
  Crown,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  MessageSquare,
  MousePointer2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const roleConfig = {
  owner: { icon: Crown, label: '擁有者', color: 'text-amber-500 bg-amber-50' },
  editor: { icon: Pencil, label: '編輯者', color: 'text-primary bg-primary/10' },
  viewer: { icon: Eye, label: '檢視者', color: 'text-muted bg-border-light' },
};

// Avatar colors for members without images
const avatarColors = ['bg-secondary', 'bg-primary', 'bg-lavender', 'bg-tertiary', 'bg-peach'];

export default function CollaboratePage() {
  const { members, comments, presence, inviteCode, shareLink, removeMember, updateMemberRole, addComment } = useCollabStore();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [newComment, setNewComment] = useState('');

  const handleCopy = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const colors = ['#FFDAB9', '#B8D8BA', '#C3B1E1', '#F4A7B9'];
    addComment({
      id: `comment_${Date.now()}`,
      author: '小明',
      authorAvatar: '',
      content: newComment.trim(),
      color: colors[Math.floor(Math.random() * colors.length)],
      position: { x: 0, y: 0 },
      createdAt: new Date().toISOString(),
    });
    setNewComment('');
  };

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Users className="size-6 text-primary" />
          多人共編
        </h1>
        <p className="text-sm text-muted mt-1">
          邀請朋友一起規劃行程，即時同步編輯
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Invite Section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Link2 className="size-4 text-primary" />
              邀請成員
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Invite Code */}
              <div>
                <label className="text-xs text-muted mb-2 block">邀請碼</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-cream/50 border border-border rounded-xl font-mono text-sm text-foreground tracking-wider">
                    {inviteCode}
                  </div>
                  <button
                    onClick={() => handleCopy(inviteCode, 'code')}
                    className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    {copied === 'code' ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Share Link */}
              <div>
                <label className="text-xs text-muted mb-2 block">分享連結</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 px-4 py-2.5 bg-cream/50 border border-border rounded-xl text-sm text-muted truncate">
                    {shareLink}
                  </div>
                  <button
                    onClick={() => handleCopy(shareLink, 'link')}
                    className="p-2.5 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                  >
                    {copied === 'link' ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Members List */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Shield className="size-4 text-lavender" />
                成員與權限
              </h2>
              <span className="text-xs text-muted bg-border-light px-2 py-0.5 rounded-full">
                {members.length} 位成員
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {members.map((member, i) => {
                const config = roleConfig[member.role];
                const RoleIcon = config.icon;
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-cream/40 transition-colors group"
                  >
                    {/* Avatar */}
                    <div className="relative">
                      <div className={cn('size-10 rounded-full flex items-center justify-center text-white text-sm font-bold', avatarColors[i % avatarColors.length])}>
                        {member.name[0]}
                      </div>
                      <div className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface', member.online ? 'bg-tertiary' : 'bg-muted-light')} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{member.name}</p>
                        {member.online && (
                          <span className="text-[10px] text-tertiary flex items-center gap-1">
                            <Wifi className="size-3" /> 在線
                          </span>
                        )}
                      </div>
                      <div className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5', config.color)}>
                        <RoleIcon className="size-3" />
                        {config.label}
                      </div>
                    </div>

                    {/* Role Selector */}
                    {member.role !== 'owner' && (
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberRole(member.id, e.target.value as 'editor' | 'viewer')}
                        className="text-xs bg-cream/50 border border-border rounded-lg px-2 py-1 text-muted cursor-pointer focus:outline-none opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <option value="editor">編輯者</option>
                        <option value="viewer">檢視者</option>
                      </select>
                    )}

                    {/* Remove */}
                    {member.role !== 'owner' && (
                      <button
                        onClick={() => removeMember(member.id)}
                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-all cursor-pointer opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* Real-time Sync & Cursors */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <MousePointer2 className="size-4 text-tertiary" />
              即時同步狀態
            </h2>

            {/* Mock editing canvas */}
            <div className="relative h-48 bg-cream/50 rounded-xl border border-border-light overflow-hidden">
              {/* Grid pattern */}
              <div className="absolute inset-0 map-grid opacity-50" />

              {/* Day blocks mock */}
              {[1, 2, 3, 4, 5].map((day) => (
                <div
                  key={day}
                  className="absolute bg-surface/80 border border-border-light rounded-lg px-3 py-1.5 text-xs font-medium text-muted"
                  style={{ left: `${12 + (day - 1) * 18}%`, top: '15%' }}
                >
                  Day {day}
                </div>
              ))}

              {/* Cursors */}
              {presence.map((p) => (
                <motion.div
                  key={p.userId}
                  animate={{
                    x: [p.cursorPosition.x, p.cursorPosition.x + 30, p.cursorPosition.x - 10],
                    y: [p.cursorPosition.y, p.cursorPosition.y - 20, p.cursorPosition.y + 15],
                  }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute z-10"
                  style={{ left: 0, top: 0 }}
                >
                  <MousePointer2
                    className="size-4 -rotate-12"
                    style={{ color: p.color }}
                    fill={p.color}
                  />
                  <span
                    className="absolute left-4 top-4 px-2 py-0.5 rounded-md text-white text-[10px] font-medium whitespace-nowrap"
                    style={{ backgroundColor: p.color }}
                  >
                    {p.userName}
                  </span>
                </motion.div>
              ))}

              {/* Active section highlights */}
              {presence.map((p) => (
                <div
                  key={`section-${p.userId}`}
                  className="absolute rounded-lg border-2 opacity-20 pointer-events-none"
                  style={{
                    borderColor: p.color,
                    backgroundColor: p.color,
                    left: p.activeSection === 'Day 2' ? '30%' : '66%',
                    top: '10%',
                    width: '16%',
                    height: '30%',
                  }}
                />
              ))}

              {/* Status bar */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-tertiary animate-pulse" />
                  <span className="text-[10px] text-muted">即時同步中</span>
                </div>
                <div className="flex -space-x-1.5">
                  {members.filter((m) => m.online).map((m, i) => (
                    <div
                      key={m.id}
                      className={cn('size-6 rounded-full border-2 border-surface flex items-center justify-center text-white text-[9px] font-bold', avatarColors[i % avatarColors.length])}
                    >
                      {m.name[0]}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Column - Sticky Comments */}
        <div className="flex flex-col gap-6">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
          >
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <MessageSquare className="size-4 text-secondary" />
              留言便利貼
            </h2>

            {/* Add Comment */}
            <div className="mb-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder="新增留言..."
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-cream/50 text-sm text-foreground placeholder:text-muted-light focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  onClick={handleAddComment}
                  className="p-2 rounded-xl bg-primary text-white cursor-pointer hover:bg-primary-dark transition-colors"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>

            {/* Comments */}
            <div className="flex flex-col gap-3">
              {comments.map((comment, i) => (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.08 }}
                  className="p-4 rounded-xl border border-border-light relative"
                  style={{ backgroundColor: comment.color + '20' }}
                >
                  {/* Target day badge */}
                  {comment.targetDay && (
                    <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-primary text-white text-[10px] font-bold rounded-full">
                      Day {comment.targetDay}
                    </span>
                  )}

                  {/* Author */}
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className={cn('size-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold', avatarColors[i % avatarColors.length])}
                    >
                      {comment.author[0]}
                    </div>
                    <span className="text-xs font-medium text-foreground">{comment.author}</span>
                    <span className="text-[10px] text-muted ml-auto">
                      {new Date(comment.createdAt).toLocaleDateString('zh-TW')}
                    </span>
                  </div>

                  {/* Content */}
                  <p className="text-sm text-foreground leading-relaxed">
                    {comment.content}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
