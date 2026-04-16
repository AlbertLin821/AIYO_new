import { NextResponse } from 'next/server';

// POST /api/map/geocode
// Mock: geocode location names → lat/lng coordinates
export async function POST(request: Request) {
  const body = await request.json();
  const { locations } = body as { locations: string[] };

  await new Promise((r) => setTimeout(r, 400));

  const tokyoLocations: Record<string, { lat: number; lng: number }> = {
    淺草寺: { lat: 35.7148, lng: 139.7967 },
    澀谷十字路口: { lat: 35.6595, lng: 139.7004 },
    秋葉原: { lat: 35.7023, lng: 139.7745 },
    築地市場: { lat: 35.6654, lng: 139.7707 },
    新宿御苑: { lat: 35.6852, lng: 139.71 },
    東京鐵塔: { lat: 35.6586, lng: 139.7454 },
    台場: { lat: 35.6267, lng: 139.7752 },
    上野公園: { lat: 35.7146, lng: 139.7742 },
    原宿竹下通: { lat: 35.6702, lng: 139.7026 },
    明治神宮: { lat: 35.6764, lng: 139.6993 },
  };

  const results = (locations || []).map((name: string) => ({
    name,
    ...(tokyoLocations[name] || { lat: 35.6762 + Math.random() * 0.05, lng: 139.6503 + Math.random() * 0.1 }),
  }));

  return NextResponse.json({
    success: true,
    data: results,
  });
}
