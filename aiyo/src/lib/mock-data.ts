import type { Video, ItineraryDay, CollabMember, StickyCommentData, EditingPresence, ChatMessage, User } from './types';

// ==================== USER ====================
export const mockUser: User = {
  name: '旅行者小明',
  email: 'ming@example.com',
  travelPreferences: ['美食', '攝影', '自然'],
  budget: 50000,
  destination: '東京',
  travelDays: 5,
  preferredTransport: '地鐵',
  travelPace: 'relaxed',
  interests: ['動漫', '咖啡廳', '夜景', '寺廟'],
};

// ==================== VIDEOS ====================
export const mockVideos: Video[] = [
  {
    id: 'vid_001',
    title: '東京五天四夜自由行完整攻略｜必去景點 × 美食推薦',
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=tokyo001',
    duration: '18:32',
    summary: '這支影片完整介紹東京五天四夜的行程安排，涵蓋淺草寺、澀谷、新宿、秋葉原等經典景點，也推薦了多間必吃餐廳與隱藏版美食。適合第一次去東京的旅人，行程步調舒適不趕。',
    description: '東京自由行最完整的攻略影片，5天4夜行程全紀錄',
    source: '旅遊生活頻道',
    timestamps: [
      { time: '00:00', label: '行程總覽與花費' },
      { time: '02:15', label: 'Day 1：淺草寺與雷門' },
      { time: '05:30', label: 'Day 2：澀谷與原宿逛街' },
      { time: '08:45', label: 'Day 3：築地市場與台場' },
      { time: '11:20', label: 'Day 4：秋葉原動漫聖地' },
      { time: '14:00', label: 'Day 5：新宿購物與回程' },
      { time: '16:30', label: '住宿推薦與交通攻略' },
    ],
    extractedLocations: [
      { name: '淺草寺', lat: 35.7148, lng: 139.7967, description: '東京最古老的寺廟，雷門大燈籠是必拍地標' },
      { name: '澀谷十字路口', lat: 35.6595, lng: 139.7004, description: '全球最繁忙的行人穿越道' },
      { name: '秋葉原', lat: 35.7023, lng: 139.7745, description: '動漫迷的聖地，各式電子產品與周邊商品' },
      { name: '築地市場', lat: 35.6654, lng: 139.7707, description: '新鮮海鮮與日本料理的天堂' },
      { name: '新宿御苑', lat: 35.6852, lng: 139.7100, description: '都市中的綠洲，春天賞櫻名所' },
    ],
  },
  {
    id: 'vid_002',
    title: '大阪三天兩夜美食之旅｜道頓堀 × 黑門市場 × 環球影城',
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=osaka002',
    duration: '12:45',
    summary: '帶你逛大阪最經典的美食景點，從道頓堀的章魚燒到黑門市場的海鮮，再到環球影城的哈利波特園區。三天兩夜緊湊但精彩的行程安排。',
    description: '大阪美食與景點完整攻略',
    source: '吃貨旅遊家',
    timestamps: [
      { time: '00:00', label: '大阪行程概覽' },
      { time: '01:30', label: 'Day 1：道頓堀美食巡禮' },
      { time: '04:50', label: 'Day 2：黑門市場早餐' },
      { time: '07:15', label: 'Day 2：環球影城攻略' },
      { time: '10:30', label: 'Day 3：天守閣與購物' },
    ],
    extractedLocations: [
      { name: '道頓堀', lat: 34.6687, lng: 135.5013, description: '大阪最熱鬧的美食街，固力果跑者招牌' },
      { name: '黑門市場', lat: 34.6621, lng: 135.5065, description: '大阪人的廚房，新鮮海鮮市場' },
      { name: '大阪城天守閣', lat: 34.6873, lng: 135.5262, description: '豐臣秀吉的居城，大阪的象徵' },
    ],
  },
  {
    id: 'vid_003',
    title: '京都一日遊路線推薦｜金閣寺 × 嵐山 × 伏見稻荷',
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=kyoto003',
    duration: '15:20',
    summary: '京都一日遊最佳路線規劃，從金閣寺出發經嵐山竹林到伏見稻荷大社。包含交通方式、最佳拍照時間和隱藏景點推薦。',
    description: '一天內玩遍京都三大必去景點的完整攻略',
    source: '日本深度遊',
    timestamps: [
      { time: '00:00', label: '路線規劃與交通' },
      { time: '02:00', label: '金閣寺參觀攻略' },
      { time: '05:15', label: '嵐山竹林散步' },
      { time: '08:30', label: '渡月橋與嵐山小火車' },
      { time: '11:00', label: '伏見稻荷千本鳥居' },
      { time: '13:45', label: '京都美食推薦' },
    ],
    extractedLocations: [
      { name: '金閣寺', lat: 35.0394, lng: 135.7292, description: '世界遺產，金碧輝煌的禪寺' },
      { name: '嵐山竹林', lat: 35.0170, lng: 135.6713, description: '夢幻的竹林小徑' },
      { name: '伏見稻荷大社', lat: 34.9671, lng: 135.7727, description: '千本鳥居，京都最具代表性的神社' },
    ],
  },
  {
    id: 'vid_004',
    title: '沖繩自駕遊五天攻略｜海灘 × 水族館 × 美國村',
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=okinawa004',
    duration: '20:10',
    summary: '沖繩五天自駕遊完整行程，從美麗海水族館到古宇利島，再到國際通購物。含租車資訊、住宿推薦和親子景點。',
    description: '沖繩自駕遊全攻略，帶你玩遍沖繩的碧海藍天',
    source: '海島旅行家',
    timestamps: [
      { time: '00:00', label: '租車與交通須知' },
      { time: '03:00', label: 'Day 1-2：北部水族館路線' },
      { time: '08:00', label: 'Day 3：中部美國村' },
      { time: '12:00', label: 'Day 4-5：南部與那霸' },
    ],
    extractedLocations: [
      { name: '美麗海水族館', lat: 26.6943, lng: 127.8776, description: '世界最大的水族館之一' },
      { name: '古宇利島', lat: 26.7000, lng: 128.0233, description: '沖繩最美的離島海灘' },
      { name: '國際通', lat: 26.2149, lng: 127.6847, description: '那霸必逛的購物大街' },
    ],
  },
  {
    id: 'vid_005',
    title: '首爾自由行四天三夜｜明洞 × 弘大 × 韓屋村',
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=seoul005',
    duration: '16:50',
    summary: '首爾四天三夜自由行攻略，涵蓋明洞購物、弘大逛街、北村韓屋村等人氣景點，還有韓式烤肉和部隊鍋美食推薦。',
    description: '首爾最新潮的旅遊攻略',
    source: 'K-Travel',
    timestamps: [
      { time: '00:00', label: '首爾行程總覽' },
      { time: '02:30', label: 'Day 1：明洞購物攻略' },
      { time: '06:00', label: 'Day 2：弘大文青路線' },
      { time: '09:30', label: 'Day 3：景福宮與韓屋村' },
      { time: '12:45', label: 'Day 4：東大門與回程' },
    ],
    extractedLocations: [
      { name: '明洞', lat: 37.5636, lng: 126.9860, description: '首爾最熱鬧的購物區' },
      { name: '弘大', lat: 37.5563, lng: 126.9237, description: '年輕人的潮流文化中心' },
      { name: '北村韓屋村', lat: 37.5826, lng: 126.9854, description: '傳統韓屋建築保存區' },
    ],
  },
  {
    id: 'vid_006',
    title: '曼谷五天四夜驚喜之旅｜大皇宮 × 水上市場 × 按摩美食',
    thumbnail: '',
    url: 'https://www.youtube.com/watch?v=bangkok006',
    duration: '14:25',
    summary: '曼谷五天四夜全攻略，從大皇宮到丹嫩莎朵水上市場，夜市美食到頂級按摩SPA，用最少的錢玩最多的景點。',
    description: '曼谷超CP值旅遊攻略',
    source: '東南亞旅遊達人',
    timestamps: [
      { time: '00:00', label: '曼谷旅遊須知' },
      { time: '02:00', label: 'Day 1：大皇宮巡禮' },
      { time: '05:30', label: 'Day 2：水上市場體驗' },
      { time: '09:00', label: 'Day 3-4：夜市與美食' },
      { time: '12:00', label: 'Day 5：按摩SPA推薦' },
    ],
    extractedLocations: [
      { name: '大皇宮', lat: 13.7500, lng: 100.4914, description: '泰國最神聖的佛教聖地' },
      { name: '丹嫩莎朵水上市場', lat: 13.5189, lng: 100.0000, description: '最著名的水上市場體驗' },
      { name: '考山路', lat: 13.7588, lng: 100.4974, description: '背包客天堂的夜生活街區' },
    ],
  },
];

// ==================== ITINERARY ====================
export const mockItinerary: ItineraryDay[] = [
  {
    day: 1,
    theme: '淺草文化探索',
    items: [
      { id: 'item_001', time: '09:00', title: '淺草寺', type: 'attraction', transport: '地鐵銀座線', notes: '建議早上前往避開人潮，雷門大燈籠必拍', location: { name: '淺草寺', lat: 35.7148, lng: 139.7967, description: '東京最古老的寺廟' } },
      { id: 'item_002', time: '11:30', title: '仲見世商店街午餐', type: 'restaurant', notes: '必吃人形燒和雷おこし', location: { name: '仲見世通り', lat: 35.7118, lng: 139.7966, description: '傳統日式小吃街' } },
      { id: 'item_003', time: '13:00', title: '東京晴空塔', type: 'attraction', transport: '步行 15 分鐘', notes: '展望台門票需預約', location: { name: '東京晴空塔', lat: 35.7101, lng: 139.8107, description: '634公尺的東京地標' } },
      { id: 'item_004', time: '16:00', title: '上野公園散步', type: 'activity', transport: '地鐵銀座線', notes: '如果有櫻花季更美', location: { name: '上野公園', lat: 35.7146, lng: 139.7732, description: '東京最大的都市公園' } },
      { id: 'item_005', time: '18:30', title: '阿美橫丁晚餐', type: 'restaurant', transport: '步行 5 分鐘', notes: '串燒和海鮮丼推薦', location: { name: '阿美橫丁', lat: 35.7108, lng: 139.7745, description: '充滿活力的傳統商店街' } },
    ],
  },
  {
    day: 2,
    theme: '潮流與購物',
    items: [
      { id: 'item_006', time: '10:00', title: '澀谷十字路口', type: 'attraction', transport: '地鐵半藏門線', notes: '從星巴克二樓看十字路口全景', location: { name: '澀谷十字路口', lat: 35.6595, lng: 139.7004, description: '全球最繁忙路口' } },
      { id: 'item_007', time: '11:30', title: '原宿竹下通', type: 'shopping', transport: '步行 15 分鐘', notes: '可麗餅必吃', location: { name: '竹下通', lat: 35.6707, lng: 139.7029, description: '日本年輕人潮流聖地' } },
      { id: 'item_008', time: '13:00', title: '表參道午餐', type: 'restaurant', notes: '建議 bills 的舒芙蕾鬆餅', location: { name: '表參道', lat: 35.6654, lng: 139.7121, description: '東京的香榭麗舍大道' } },
      { id: 'item_009', time: '15:00', title: '明治神宮', type: 'attraction', transport: '步行 10 分鐘', notes: '寧靜的森林參道', location: { name: '明治神宮', lat: 35.6764, lng: 139.6993, description: '東京最重要的神社' } },
      { id: 'item_010', time: '18:00', title: '新宿歌舞伎町晚餐', type: 'restaurant', transport: '地鐵副都心線', notes: '一蘭拉麵或燒肉', location: { name: '新宿', lat: 35.6938, lng: 139.7034, description: '不夜城新宿' } },
    ],
  },
  {
    day: 3,
    theme: '築地美食與台場',
    items: [
      { id: 'item_011', time: '07:00', title: '築地市場早餐', type: 'restaurant', transport: '地鐵日比谷線', notes: '壽司大排隊值得', location: { name: '築地市場', lat: 35.6654, lng: 139.7707, description: '新鮮海鮮天堂' } },
      { id: 'item_012', time: '10:00', title: '台場海濱公園', type: 'attraction', transport: '百合海鷗號', notes: '看彩虹大橋與自由女神', location: { name: '台場', lat: 35.6270, lng: 139.7747, description: '東京灣的人工島' } },
      { id: 'item_013', time: '13:00', title: 'DiverCity 午餐', type: 'restaurant', notes: '獨角獸鋼彈必看', location: { name: 'DiverCity Tokyo', lat: 35.6252, lng: 139.7750, description: '台場大型購物中心' } },
      { id: 'item_014', time: '15:00', title: 'teamLab Borderless', type: 'activity', notes: '建議停留2-3小時', location: { name: 'teamLab', lat: 35.6265, lng: 139.7841, description: '數位藝術互動體驗' } },
    ],
  },
  {
    day: 4,
    theme: '秋葉原動漫日',
    items: [
      { id: 'item_015', time: '10:00', title: '秋葉原電器街', type: 'shopping', transport: '地鐵日比谷線', notes: '動漫周邊、模型、電子產品', location: { name: '秋葉原', lat: 35.7023, lng: 139.7745, description: '動漫迷的聖地' } },
      { id: 'item_016', time: '12:30', title: '女僕咖啡廳體驗', type: 'restaurant', notes: '獨特的日本文化體驗', location: { name: '秋葉原', lat: 35.7023, lng: 139.7745, description: '秋葉原特色體驗' } },
      { id: 'item_017', time: '14:30', title: '東京車站一番街', type: 'shopping', transport: '地鐵銀座線', notes: '各種角色商品專賣店', location: { name: '東京車站', lat: 35.6812, lng: 139.7671, description: '東京的交通樞紐' } },
      { id: 'item_018', time: '17:00', title: '東京鐵塔夜景', type: 'attraction', transport: '地鐵大江戶線', notes: '日落時分上去最美', location: { name: '東京鐵塔', lat: 35.6586, lng: 139.7454, description: '東京經典地標' } },
    ],
  },
  {
    day: 5,
    theme: '新宿購物與回程',
    items: [
      { id: 'item_019', time: '09:00', title: '新宿御苑', type: 'attraction', transport: '地鐵丸之內線', notes: '城市中的綠洲，適合散步', location: { name: '新宿御苑', lat: 35.6852, lng: 139.7100, description: '都市中的大型庭園' } },
      { id: 'item_020', time: '11:00', title: '新宿百貨購物', type: 'shopping', transport: '步行 10 分鐘', notes: '伊勢丹百貨、LUMINE', location: { name: '新宿', lat: 35.6938, lng: 139.7034, description: '東京最大的商業區' } },
      { id: 'item_021', time: '13:00', title: '最後的午餐', type: 'restaurant', notes: '記得買伴手禮！', location: { name: '新宿', lat: 35.6938, lng: 139.7034, description: '' } },
      { id: 'item_022', time: '15:00', title: '前往成田機場', type: 'transport', transport: 'N\'EX 成田特快', notes: '提早2小時到機場' },
    ],
  },
];

// ==================== COLLABORATION ====================
export const mockCollabMembers: CollabMember[] = [
  { id: 'user_001', name: '小明', avatar: '', role: 'owner', online: true },
  { id: 'user_002', name: '小華', avatar: '', role: 'editor', online: true },
  { id: 'user_003', name: '阿美', avatar: '', role: 'editor', online: false },
  { id: 'user_004', name: '大衛', avatar: '', role: 'viewer', online: true },
  { id: 'user_005', name: '小芳', avatar: '', role: 'viewer', online: false },
];

export const mockStickyComments: StickyCommentData[] = [
  { id: 'comment_001', author: '小華', authorAvatar: '', content: '建議 Day 2 晚餐改到澀谷的燒肉店，我上次去超好吃！', color: '#FFDAB9', position: { x: 20, y: 15 }, createdAt: '2024-03-15T10:30:00Z', targetDay: 2 },
  { id: 'comment_002', author: '阿美', authorAvatar: '', content: 'Day 3 的 teamLab 需要提前買票喔，現場可能排很久', color: '#B8D8BA', position: { x: 55, y: 30 }, createdAt: '2024-03-15T11:00:00Z', targetDay: 3 },
  { id: 'comment_003', author: '大衛', authorAvatar: '', content: '秋葉原那天可以順便去神田萬世橋吃咖哩嗎？', color: '#C3B1E1', position: { x: 35, y: 60 }, createdAt: '2024-03-15T14:20:00Z', targetDay: 4 },
  { id: 'comment_004', author: '小華', authorAvatar: '', content: '最後一天要不要一起去吉祥寺逛逛？離新宿很近', color: '#F4A7B9', position: { x: 70, y: 45 }, createdAt: '2024-03-16T09:15:00Z', targetDay: 5 },
];

export const mockPresence: EditingPresence[] = [
  { userId: 'user_002', userName: '小華', cursorPosition: { x: 340, y: 280 }, color: '#F4A7B9', activeSection: 'Day 2' },
  { userId: 'user_004', userName: '大衛', cursorPosition: { x: 560, y: 420 }, color: '#7C9CBF', activeSection: 'Day 4' },
];

// ==================== CHAT MESSAGES ====================
export const mockChatMessages: ChatMessage[] = [
  { id: 'msg_001', role: 'ai', content: '你好！我是 AIYO 旅遊助手 ✈️ 告訴我你想去哪裡旅行，我來幫你規劃行程！', timestamp: '10:00' },
  { id: 'msg_002', role: 'user', content: '我想去東京五天四夜，預算大概五萬台幣，喜歡動漫和美食', timestamp: '10:01' },
  { id: 'msg_003', role: 'ai', content: '太棒了！東京是動漫迷和美食愛好者的天堂！🎌\n\n我幫你整理了一些基本資訊：\n• 目的地：東京\n• 天數：5天4夜\n• 預算：50,000 TWD\n• 興趣：動漫、美食\n\n我建議把行程分為：\n1. 淺草文化區\n2. 澀谷原宿潮流區\n3. 築地・台場海濱區\n4. 秋葉原動漫日\n5. 新宿購物與回程\n\n需要我幫你生成詳細的每日行程嗎？', timestamp: '10:01' },
  { id: 'msg_004', role: 'user', content: '好啊！不過我不想太趕，希望步調輕鬆一點', timestamp: '10:02' },
  { id: 'msg_005', role: 'ai', content: '了解！我會調整成舒適的步調 😊\n\n每天大概安排 3-4 個主要景點，中間留有充足的休息和探索時間。\n\n已經幫你生成行程了，你可以到「行程管理」頁面查看詳細安排，也可以在「地圖」頁面看到所有景點的位置標記。\n\n有任何想調整的地方隨時跟我說！', timestamp: '10:03', suggestedAction: { type: 'add_itinerary_item', day: 1 } },
];
