import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export async function GET() {
  const envPath = path.resolve(process.cwd(), '.env');
  
  if (!fs.existsSync(envPath)) {
    return NextResponse.json({ error: 'No .env file found' }, { status: 404 });
  }

  const envConfig = dotenv.parse(fs.readFileSync(envPath));

  // Filter out sensitive information
  const safeEnv = Object.keys(envConfig).reduce((acc, key) => {
    if (!key.toLowerCase().includes('secret') && !key.toLowerCase().includes('password')) {
      acc[key] = envConfig[key];
    } else {
      acc[key] = '[HIDDEN]';
    }
    return acc;
  }, {} as Record<string, string>);

  return NextResponse.json(safeEnv);
}
