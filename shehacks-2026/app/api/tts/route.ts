import { NextResponse } from 'next/server';
console.log("DEBUG: Process ENV Key check:", process.env.ELEVENLABS_API_KEY ? "FOUND" : "NOT FOUND");

export async function POST(req: Request) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
    
    // Log to your TERMINAL (not browser) to verify the key is loaded
    console.log('API Route hit! Key exists:', !!apiKey); 

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Server configuration error: Missing API Key in .env.local' }, 
        { status: 500 }
      );
    }

    const { text } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const response = await fetch(
      'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', 
          voice_settings: { 
          stability: 0.5, 
          similarity_boost: 0.75
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API Error:', errorText);
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const audioBuffer = await response.arrayBuffer();
    
    return new NextResponse(audioBuffer, {
      headers: { 
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('Proxy Route Crash:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}