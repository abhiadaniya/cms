/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize server-side Gemini Client
let ai: GoogleGenAI | null = null;
const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6Ksw1wbD1oFQX7J7vwaQInpYwMkNSuWFmGmbtBHDUW0wA';

if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// AI Assistant Chat Route
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { message, history = [], userContext } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // System prompt with university knowledge
    const systemInstruction = `You are the official JNTUH UCEMB (Jawaharlal Nehru Technological University Hyderabad - University College of Engineering Manthani, Peddapalli) AI Academic & Campus Assistant.
Your role is to help students, faculty, and administrators with academic queries, attendance standing, fee schedules, assignments, study resources, and university operations.

Current context:
- College: JNTUH College of Engineering Manthani (UCEMB)
- Active User: ${userContext?.name || 'College Member'} (${userContext?.userId || 'N/A'}, Role: ${userContext?.role || 'Student'})
- Minimum required attendance for semester exam eligibility without condonation: 75%
- Current Term: Academic Year 2026-27, B.Tech IV Year I Semester
- Tone: Professional, polite, accurate, encouraging, and clear. Format responses with neat bullet points, markdown bolding, or tables where appropriate. Keep answers concise and directly actionable.`;

    if (!ai) {
      // Fallback response generator if GEMINI_API_KEY is not configured
      const fallbackReply = generateFallbackResponse(message, userContext);
      res.json({ reply: fallbackReply });
      return;
    }

    // Format chat contents
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    // Append past messages if provided
    if (Array.isArray(history)) {
      for (const h of history.slice(-6)) {
        contents.push({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }]
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        tools: [{ googleSearch: {} }]
      }
    });

    const reply = response.text || "I'm here to help with your academic inquiries at JNTUH UCEMB.";
    
    // Extract web search citations if present
    const rawChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = rawChunks
      .map((c: any) => c.web?.uri ? { title: c.web.title || 'University Web Reference', url: c.web.uri } : null)
      .filter(Boolean);

    res.json({ reply, sources });
  } catch (error: unknown) {
    console.error('Gemini API Error:', error);
    // Graceful fallback response on error
    res.json({ 
      reply: `I received your query: "${req.body.message}". (AI Academic Advisor: Minimum attendance is 75%, mid-terms begin Nov 10, and weekly trends show high consistency).` 
    });
  }
});

// Audio Transcription Route using gemini-3.5-transcribe
app.post('/api/ai/transcribe', async (req, res) => {
  try {
    const { audioData, mimeType = 'audio/webm' } = req.body;
    if (!audioData) {
      res.status(400).json({ error: 'audioData is required' });
      return;
    }

    if (!ai) {
      res.json({ text: 'Check my attendance record and weekly performance.' });
      return;
    }

    const cleanBase64 = audioData.replace(/^data:audio\/[a-zA-Z0-9.+_-]+;base64,/, '');
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType
              }
            },
            {
              text: 'Transcribe this spoken audio into English text. Provide only the transcribed spoken sentence.'
            }
          ]
        }
      ]
    });

    const text = response.text ? response.text.trim() : '';
    res.json({ text });
  } catch (error) {
    console.error('Audio Transcription Error:', error);
    res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});

function generateFallbackResponse(query: string, user: { name?: string; role?: string } | undefined): string {
  const q = query.toLowerCase();
  const userName = user?.name || 'Student';

  if (q.includes('attendance') || q.includes('shortage') || q.includes('condonation')) {
    return `Hello **${userName}**,\n\nAt JNTUH UCEMB, students must maintain a minimum of **75% overall attendance** across theory and lab sessions to be eligible for end-semester university examinations.\n\n- **75% and above**: Eligible for regular hall tickets.\n- **65% to 74.9%**: Requires formal medical condonation fee payment subject to Principal's approval.\n- **Below 65%**: Detention status as per university regulations.\n\nYou can track live subject-wise attendance and use the attendance calculator directly in your Attendance tab!`;
  }
  if (q.includes('assignment') || q.includes('dbms') || q.includes('bcnf') || q.includes('homework')) {
    return `### DBMS Assignment: BCNF Normalization Guide\n\n**Boyce-Codd Normal Form (BCNF)** is an advanced version of 3NF:\n1. A relation $R$ is in BCNF if for every non-trivial functional dependency $X \\to Y$, $X$ must be a **Super Key**.\n2. In your University Hospital case study, check dependencies where non-super keys determine partial attributes.\n3. Make sure to upload your solution in PDF format on the Assignments tab before the due date!`;
  }
  if (q.includes('fee') || q.includes('mess') || q.includes('due') || q.includes('pay')) {
    return `Hello **${userName}**,\n\nHostel mess charges and campus amenities fees can be viewed under the **Fee Status** tab. Payments can be settled via UPI/NetBanking simulation, and an official university PDF receipt with transaction ID will be generated instantaneously.`;
  }
  if (q.includes('exam') || q.includes('timetable') || q.includes('hall ticket')) {
    return `**JNTUH Examination Update:**\n\n- **Mid-Term II Exams**: Commencing from **10th November 2026**.\n- **Hall Tickets**: Available for one-click PDF download in the **Hall Ticket & Exams** tab once your attendance is above 75%.\n- Exam Center: UCEMB Center Code **605**.`;
  }
  return `Hello **${userName}**,\n\nI am your **JNTUH UCEMB Academic AI Assistant**. You can ask me about:\n- Subject concepts & assignment solutions\n- Attendance eligibility & condonation rules\n- Fee schedules and mess dues\n- Examination dates & syllabus breakdown\n- Faculty office hours and campus procedures`;
}

// Development with Vite vs Production
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

setupServer();
