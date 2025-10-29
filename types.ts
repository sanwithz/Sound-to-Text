
import type { GoogleGenAI } from '@google/genai';

// This creates a type for the resolved value of the ai.live.connect() promise
export type LiveSession = Awaited<ReturnType<typeof GoogleGenAI.prototype.live.connect>>;
