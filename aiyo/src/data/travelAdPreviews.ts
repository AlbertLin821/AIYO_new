export type TravelAdPreview = {
  id: string;
  brand: string;
  partner: string | null;
  title: string;
  description: string;
  cta: string;
  bg: string;
  titleColor: string;
  descColor: string;
  btnBg: string;
  btnColor: string;
};

export const TRAVEL_AD_PREVIEWS: TravelAdPreview[] = [
  {
    id: "ad-1",
    brand: "TravelGo",
    partner: "LINE Bank",
    title: "日韓泰 機票飯店 85 折起",
    description: "機票、飯店、機加酒專屬優惠",
    cta: "每週三優惠",
    bg: "linear-gradient(135deg, #e8f5e9 0%, #a5d6a7 100%)",
    titleColor: "#1b5e20",
    descColor: "#2e7d32",
    btnBg: "#ff5722",
    btnColor: "#fff",
  },
  {
    id: "ad-2",
    brand: "GoAsia",
    partner: null,
    title: "深度旅遊 搶飯店優惠 $300",
    description: "訂機票、飯店拿 500 獎勵金",
    cta: "立即預訂",
    bg: "linear-gradient(135deg, #e3f2fd 0%, #90caf9 100%)",
    titleColor: "#0d47a1",
    descColor: "#1565c0",
    btnBg: "#d32f2f",
    btnColor: "#fff",
  },
  {
    id: "ad-3",
    brand: "FunTrip",
    partner: "VISA",
    title: "釜山自由行 加購行李 5 折",
    description: "每週一開搶 限量優惠",
    cta: "每週一開搶",
    bg: "linear-gradient(135deg, #fce4ec 0%, #f48fb1 100%)",
    titleColor: "#880e4f",
    descColor: "#ad1457",
    btnBg: "#6a1b9a",
    btnColor: "#fff",
  },
  {
    id: "ad-4",
    brand: "SkyPass",
    partner: "MasterCard",
    title: "東京大阪 來回機票 $4,999",
    description: "限時搶購 售完為止",
    cta: "馬上搶",
    bg: "linear-gradient(135deg, #fff3e0 0%, #ffcc80 100%)",
    titleColor: "#e65100",
    descColor: "#bf360c",
    btnBg: "#1565c0",
    btnColor: "#fff",
  },
  {
    id: "ad-5",
    brand: "StayEasy",
    partner: null,
    title: "曼谷五星飯店 買一送一",
    description: "入住含早餐、免費接駁",
    cta: "限量搶購",
    bg: "linear-gradient(135deg, #f3e5f5 0%, #ce93d8 100%)",
    titleColor: "#4a148c",
    descColor: "#6a1b9a",
    btnBg: "#00897b",
    btnColor: "#fff",
  },
  {
    id: "ad-6",
    brand: "RailEurope",
    partner: "JCB",
    title: "歐洲火車通票 75 折",
    description: "暢遊法德義瑞 無限搭乘",
    cta: "立即選購",
    bg: "linear-gradient(135deg, #e0f2f1 0%, #80cbc4 100%)",
    titleColor: "#004d40",
    descColor: "#00695c",
    btnBg: "#c62828",
    btnColor: "#fff",
  },
  {
    id: "ad-7",
    brand: "IslandHop",
    partner: null,
    title: "沖繩租車自駕 3 日 $1,200",
    description: "含全險、免費 GPS 導航",
    cta: "預約租車",
    bg: "linear-gradient(135deg, #e1f5fe 0%, #4fc3f7 100%)",
    titleColor: "#01579b",
    descColor: "#0277bd",
    btnBg: "#f57c00",
    btnColor: "#fff",
  },
  {
    id: "ad-8",
    brand: "WifiGo",
    partner: "中華電信",
    title: "出國上網 吃到飽 $99/天",
    description: "日韓東南亞 高速不降速",
    cta: "立即申辦",
    bg: "linear-gradient(135deg, #fff9c4 0%, #fff176 100%)",
    titleColor: "#f57f17",
    descColor: "#f9a825",
    btnBg: "#283593",
    btnColor: "#fff",
  },
];
