import { NextResponse } from 'next/server';

// POST /api/collab/join
// Mock: join a collaboration session via invite code
export async function POST(request: Request) {
  const body = await request.json();
  const { inviteCode } = body;

  await new Promise((r) => setTimeout(r, 300));

  if (!inviteCode || inviteCode.length < 4) {
    return NextResponse.json(
      { success: false, error: '無效的邀請碼' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      tripId: 'trip_mock_' + Date.now(),
      tripName: '東京五天四夜之旅',
      role: 'editor',
      members: 5,
    },
  });
}
