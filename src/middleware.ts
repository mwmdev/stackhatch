import { NextResponse } from "next/server";

// Auth disabled for local development
export default function middleware() {
  return NextResponse.next();
}
