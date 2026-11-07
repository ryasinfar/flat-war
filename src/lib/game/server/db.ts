// ─── Flat War server db client (no query logging, singleton) ─────────────────
import { PrismaClient } from '@prisma/client'

const globalForGameDb = globalThis as unknown as { gamePrisma: PrismaClient | undefined }

export const db =
  globalForGameDb.gamePrisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForGameDb.gamePrisma = db
