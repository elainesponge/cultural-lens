

export enum AppMode {
  AUDIT = 'AUDIT',
  CONSULTANT = 'CONSULTANT'
}

export enum Sentiment {
  RISK = 'RISK',
  RESONANCE = 'RESONANCE',
  NEUTRAL = 'NEUTRAL'
}

export interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface AuditAnnotation {
  id: string;
  label: string;
  sentiment: Sentiment;
  box_2d: BoundingBox;
  description: string;
  suggestion?: string;
  suggestionPrompt?: string; // For AI generation
}

export interface AuditResult {
  annotations: AuditAnnotation[];
  region: string;
}

export enum ConsultantLevel {
  FAST = 'Fast Mode',
  DEEP = 'Deep Mode'
}

export interface MoodCardData {
  title: string;
  timing: string; // e.g., "April 13-15"
  visuals: string[]; // Text keywords
  colors: string[]; // Hex codes
  description: string; // Short context
}

export interface ChatMessage {
  role: 'user' | 'model';
  text?: string; // The summary paragraph
  moodCards?: MoodCardData[];
  isTyping?: boolean;
  // Source Attribution
  citedSources?: string[]; // List of filenames/links from Knowledge Base used
  groundingMetadata?: any; // Raw Google Search grounding data
  images?: string[]; // Array of base64 image strings for preview
}

// RAG / File Search Types
export interface KnowledgeFile {
  id: string;
  name: string;
  sourceType: 'FILE' | 'LINK'; // New field to distinguish
  mimeType?: string; // Optional for links
  uri?: string; // Gemini File URI (only for files)
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'ERROR';
}

// History & Session Types
export interface AuditSession {
  id: string;
  timestamp: number;
  imageThumbnail: string; // Base64
  fullImage: string; // Base64
  regions: string[];
  result: AuditResult;
}

export interface ChatSession {
  id: string;
  title: string; // Auto-generated or "Session #N"
  timestamp: number;
  audience: string[];
  messages: ChatMessage[];
  level: ConsultantLevel;
  knowledgeFiles: KnowledgeFile[]; // Files attached to this session
}

// Shared Constants
export const AUDIENCE_GROUPS = [
  { label: "US", value: ["United States"] },
  { label: "EU5", value: ["France", "United Kingdom", "Germany", "Italy", "Spain"] },
  { label: "SEA5", value: ["Malaysia", "Vietnam", "Thailand", "Philippines", "Indonesia"] },
  { label: "Middle East", value: ["Middle East"] },
  { label: "Japan & Korea", value: ["Japan", "South Korea"] },
  { label: "ROW", value: ["Rest of the World"] },
  { label: "Global", value: ["Global (excluding China)"] },
];

// Settings & Models
export interface AppSettings {
  apiKey: string;
  generalModel: string;
  imageModel: string;
  auditSystemPrompt: string;
  consultantSystemPrompt: string;
}

export const AVAILABLE_MODELS = {
  general: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Fast)' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (Smart)' }
  ],
  image: [
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image (Fast)' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3.0 Pro Image (High Quality)' }
  ]
};

export const DEFAULT_AUDIT_PROMPT = `Analyze this image for cultural sensitivity specifically for these regions: {{regions}}.
Identify specific visual elements (colors, symbols, gestures, text).

**TONE & STYLE:**
- Speak like a friendly guide but be CONCISE.
- Use simple, everyday words.
- Explain things clearly but briefly (max 2 sentences per finding).

{{ragInstructions}}

For each element found:
1. Determine if it is a "RISK" (offensive, taboo, confusing) or "RESONANCE" (culturally appropriate, positive).
2. Provide a bounding box [ymin, xmin, ymax, xmax] normalized to 0-1000 scale.
3. Explain why briefly.
4. If it is a RISK, provide a concrete alternative suggestion and a short prompt to generate that alternative.

STRICT JSON OUTPUT FORMAT (Do NOT include markdown):
{
  "region": "Region Name",
  "annotations": [
    {
      "id": "unique_id",
      "label": "Short Label",
      "sentiment": "RISK" | "RESONANCE" | "NEUTRAL",
      "box_2d": { "ymin": number, "xmin": number, "ymax": number, "xmax": number },
      "description": "Concise explanation (max 30 words).",
      "suggestion": "Fix suggestion (optional)",
      "suggestionPrompt": "Image gen prompt (optional)"
    }
  ]
}`;

export const DEFAULT_CONSULTANT_PROMPT = `You are a friendly Cultural Consultant helping designers.
Target Audience: {{audience}}.
{{modeInstructions}}

{{ragInstructions}}

**YOUR MISSION:**
- Answer questions about cultural elements (festivals, colors, symbols).
- Be concise and direct. Avoid fluff.

**TONE & STYLE:**
- Conversational but speedy.
- Use Markdown.
- **LANGUAGE:** Detect the language of the user's message and reply in that SAME language. If the user asks in Spanish, reply in Spanish. If in English, reply in English.

**OUTPUT FORMAT:**
1. Start with a natural Markdown response. Cite sources inline like [Source: Name] if needed.
2. AT THE VERY END, if (and only if) requested or relevant for visuals, append a JSON block with 'moodCards'.

**Structure of the appended JSON block:**
\`\`\`json
{
  "hasMoodCards": true,
  "moodCards": [
    {
      "title": "Title",
      "timing": "Timing",
      "visuals": ["Visual Description 1", "Visual Description 2"],
      "colors": ["#Hex1", "#Hex2"],
      "description": "Brief description."
    }
  ],
  "citedSources": ["Source 1"]
}
\`\`\`

IMPORTANT: Do not output the JSON block unless necessary.`;

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  generalModel: 'gemini-2.5-flash',
  imageModel: 'gemini-2.5-flash-image',
  auditSystemPrompt: DEFAULT_AUDIT_PROMPT,
  consultantSystemPrompt: DEFAULT_CONSULTANT_PROMPT
};
