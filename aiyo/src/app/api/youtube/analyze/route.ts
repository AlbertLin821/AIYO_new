import { NextResponse } from 'next/server';

// POST /api/youtube/analyze
// Mock: analyze a YouTube video URL → return summary, timestamps, locations
export async function POST(request: Request) {
  const body = await request.json();
  const { url } = body;

  // Simulate processing delay
  await new Promise((r) => setTimeout(r, 800));

  return NextResponse.json({
    success: true,
    data: {
      videoId: 'mock_' + Date.now(),
      title: '東京五天四夜自由行完整攻略',
      summary:
        '這部影片完整介紹了東京五天四夜的自由行攻略，從淺草寺到澀谷十字路口，涵蓋了購物、美食和文化體驗等多個面向。',
      duration: '18:32',
      timestamps: [
        { time: '00:00', label: '開場介紹' },
        { time: '02:15', label: '淺草寺與仲見世通' },
        { time: '06:30', label: '秋葉原動漫街' },
        { time: '10:45', label: '澀谷十字路口' },
        { time: '14:20', label: '築地市場美食' },
      ],
      extractedLocations: [
        {
          name: '淺草寺',
          lat: 35.7148,
          lng: 139.7967,
          description: '東京最古老的寺廟',
        },
        {
          name: '澀谷十字路口',
          lat: 35.6595,
          lng: 139.7004,
          description: '全球最大的行人十字路口',
        },
        {
          name: '秋葉原',
          lat: 35.7023,
          lng: 139.7745,
          description: '動漫與電器天堂',
        },
      ],
    },
  });
}
