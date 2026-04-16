'use client';

import { useState } from 'react';
import { useUserStore } from '@/stores/useUserStore';
import { motion } from 'framer-motion';
import { User, Mail, Wallet, Globe, Heart, Save, Check } from 'lucide-react';

const preferenceOptions = [
  '美食', '攝影', '自然', '歷史', '動漫', '購物', '夜景',
  '咖啡廳', '寺廟', '海灘', '登山', '文化體驗', '藝術',
  '溫泉', '建築', '音樂', '市集', '極限運動',
];

const transportOptions = ['地鐵', '公車', '自駕', '步行', '單車', '計程車', '新幹線'];
const paceOptions = [
  { value: 'relaxed' as const, label: '😌 輕鬆', desc: '每天 2-3 個景點' },
  { value: 'moderate' as const, label: '🚶 適中', desc: '每天 4-5 個景點' },
  { value: 'intensive' as const, label: '🏃 緊湊', desc: '每天 6+ 個景點' },
];

export default function ProfilePage() {
  const store = useUserStore();
  const [name, setName] = useState(store.name);
  const [email, setEmail] = useState(store.email);
  const [budget, setBudget] = useState(store.budget.toString());
  const [preferences, setPreferences] = useState<string[]>(store.travelPreferences);
  const [transport, setTransport] = useState(store.preferredTransport);
  const [pace, setPace] = useState(store.travelPace);
  const [interests, setInterests] = useState<string[]>(store.interests);
  const [saved, setSaved] = useState(false);

  const togglePreference = (pref: string) => {
    setPreferences((prev) =>
      prev.includes(pref) ? prev.filter((p) => p !== pref) : [...prev, pref]
    );
  };

  const handleSave = () => {
    store.updateProfile({
      name,
      email,
      budget: parseInt(budget) || 0,
      travelPreferences: preferences,
      preferredTransport: transport,
      travelPace: pace,
      interests,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="min-h-screen p-6 lg:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <User className="size-6 text-primary" />
          個人資料
        </h1>
        <p className="text-sm text-muted mt-1">
          設定你的旅遊偏好，讓 AI 更了解你的喜好
        </p>
      </motion.div>

      <div className="flex flex-col gap-6">
        {/* Basic Info */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
        >
          <h2 className="font-semibold text-foreground mb-4">基本資訊</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <User className="size-4 text-muted" />
                姓名
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-cream/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Mail className="size-4 text-muted" />
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-cream/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Wallet className="size-4 text-muted" />
                預設預算 (TWD)
              </label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-cream/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all text-sm"
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
                <Globe className="size-4 text-muted" />
                偏好交通方式
              </label>
              <div className="flex flex-wrap gap-1.5">
                {transportOptions.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTransport(t)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      transport === t
                        ? 'bg-primary text-white'
                        : 'bg-border-light text-muted hover:bg-primary/10 hover:text-primary'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Travel Pace */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
        >
          <h2 className="font-semibold text-foreground mb-4">旅遊步調</h2>
          <div className="grid grid-cols-3 gap-3">
            {paceOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setPace(option.value)}
                className={`p-4 rounded-xl border-2 text-center transition-all cursor-pointer ${
                  pace === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border-light hover:border-primary/30'
                }`}
              >
                <p className="text-lg mb-1">{option.label.split(' ')[0]}</p>
                <p className="text-sm font-medium text-foreground">{option.label.split(' ')[1]}</p>
                <p className="text-[11px] text-muted mt-1">{option.desc}</p>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Travel Preferences */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-surface rounded-2xl shadow-soft p-6 border border-border-light"
        >
          <h2 className="font-semibold text-foreground mb-2 flex items-center gap-2">
            <Heart className="size-4 text-secondary" />
            旅遊偏好
          </h2>
          <p className="text-xs text-muted mb-4">選擇你感興趣的旅遊類型，AI 會據此推薦行程</p>
          <div className="flex flex-wrap gap-2">
            {preferenceOptions.map((pref) => (
              <button
                key={pref}
                onClick={() => togglePreference(pref)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                  preferences.includes(pref)
                    ? 'bg-secondary/15 text-secondary border border-secondary/30'
                    : 'bg-border-light text-muted hover:bg-secondary/10 hover:text-secondary border border-transparent'
                }`}
              >
                {preferences.includes(pref) && <span className="mr-1">✓</span>}
                {pref}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Save Button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex justify-end pb-8"
        >
          <button
            onClick={handleSave}
            className={`px-6 py-3 rounded-xl font-medium text-sm transition-all cursor-pointer flex items-center gap-2 ${
              saved
                ? 'bg-tertiary text-white'
                : 'bg-primary text-white hover:bg-primary-dark hover:shadow-md'
            }`}
          >
            {saved ? (
              <>
                <Check className="size-4" />
                已儲存！
              </>
            ) : (
              <>
                <Save className="size-4" />
                儲存設定
              </>
            )}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
