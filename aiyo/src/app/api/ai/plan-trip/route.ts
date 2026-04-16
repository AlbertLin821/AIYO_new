import { NextResponse } from 'next/server';

// POST /api/ai/plan-trip
// Mock: generate an AI trip plan based on destination, days, budget
export async function POST(request: Request) {
  const body = await request.json();
  const { destination, days, budget } = body;

  await new Promise((r) => setTimeout(r, 1000));

  const plan = Array.from({ length: days || 5 }, (_, i) => ({
    day: i + 1,
    theme: `Day ${i + 1} 主題`,
    items: [
      {
        id: `ai_${i}_1`,
        time: '09:00',
        title: `${destination || '東京'} 景點 ${i + 1}-A`,
        type: 'attraction',
      },
      {
        id: `ai_${i}_2`,
        time: '12:00',
        title: `午餐推薦 ${i + 1}`,
        type: 'restaurant',
      },
      {
        id: `ai_${i}_3`,
        time: '14:00',
        title: `${destination || '東京'} 景點 ${i + 1}-B`,
        type: 'attraction',
      },
    ],
  }));

  return NextResponse.json({
    success: true,
    data: {
      destination: destination || '東京',
      days: days || 5,
      budget: budget || 50000,
      itinerary: plan,
    },
  });
}
