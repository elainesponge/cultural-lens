
export enum AppMode {
  AUDIT = 'AUDIT',
  CONSULTANT = 'CONSULTANT',
  LOCALIZER = 'LOCALIZER'
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
  isActive: boolean; // Controls if this specific file is used in context
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

export interface LocalizedConcept {
  id: string;
  title: string;
  environmentalContext: string;
  emotionalMotivation: string;
  beforeVisualPrompt: string;
  afterVisualPrompt: string;
  demoImageUrl?: string;
  demoBeforeImageUrl?: string;
}

export interface LocalizerResult {
  concepts: LocalizedConcept[];
  region: string;
  analysis?: string;
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
  localizerSystemPrompt: string;
}

export const AVAILABLE_MODELS = {
  general: [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Fastest)' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3.0 Flash (Balanced)' },
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (Advanced Reasoning)' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3.0 Pro (Intelligence)' }
  ],
  image: [
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image (Fast)' },
    { id: 'gemini-3-pro-image-preview', name: 'Gemini 3.0 Pro Image (High Quality)' }
  ]
};

export const DEFAULT_AUDIT_PROMPT = `Analyze this image for cultural sensitivity specifically for these regions: {{regions}}.
Identify specific visual elements (colors, symbols, gestures, text).

**INCLUSIVITY & REPRESENTATION:**
- Evaluate the representation of people. Is it gender-inclusive? Does it represent a diverse range of identities relevant to the region?
- Flag any lack of diversity or gender bias as a "RISK".

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
- Provide advice that is gender-inclusive and representative of diverse identities within the target culture.
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

export const DEFAULT_LOCALIZER_PROMPT = `You are a Creative Localization Expert specializing in social media trends (TikTok, Instagram, Douyin).
Your task is to analyze the provided "AI Effect" and localize it for a specific geographic region: {{region}}.

**INPUTS PROVIDED:**
- **Effect Description**: {{effectDescription}}
- **Emotion Keywords**: {{emotionKeywords}}
- **Use Cases**: {{useCases}}
- **Visual Reference**: Before/After media provided as a *reference example* of the visual mechanic.

**ANALYSIS STEP:**
- **PRIORITY 1 (Textual Truth):** Use the provided Description, Emotions, and Use Cases as the absolute primary source of truth. The effect's purpose and "vibe" are defined here.
- **PRIORITY 2 (Visual Mechanic):** Identify the core visual transformation style from the media (e.g., 3D felted texture, neon outlines, pixel art). This is the "look" to be adapted.
- **PRIORITY 3 (Cultural Adaptation):** The subject and setting in the reference media are ONLY EXAMPLES. You MUST adapt the subject (ethnicity, fashion, gender, age) and the environment to be authentic and high-engagement for {{region}}. Do NOT strictly replicate the specific features of the person in the reference image.

**GOAL:**
Generate 3 distinct, culturally resonant concepts that adapt the visual mechanic for the local culture and platform-native aesthetics of {{region}}.

**INCLUSIVITY & DIVERSITY MANDATE (CRITICAL):**
- You MUST ensure gender inclusivity across the concepts.
- Represent a diverse range of identities, body types, and local fashion styles authentic to {{region}}.

**EACH CONCEPT MUST INCLUDE:**
1. **Title**: A catchy, local social-media-friendly name.
2. **Environmental Context**: A specific social setting in {{region}} where this effect would trend.
3. **Emotional Motivation**: The specific "vibe" or "mood" that resonates with local youth, driven by the provided Emotion Keywords.
4. **Before Visual Prompt**: A highly detailed prompt for an image generation model that describes the subject and setting *WITHOUT* the AI effect applied. It must be culturally authentic to {{region}}.
5. **After Visual Prompt**: A highly detailed prompt for an image generation model that describes the *EXACT SAME* subject and setting as the "Before" prompt, but *WITH* the core visual mechanic (the transformation style) applied. It must align with the provided Use Cases.

{{ragInstructions}}

STRICT JSON OUTPUT FORMAT (Do NOT include markdown):
{
  "region": "{{region}}",
  "analysis": "Briefly describe the core visual mechanic identified and the intended emotions/vibe. IMPORTANT: Do NOT describe the specific person or subject in the reference media (e.g., their ethnicity, hair, or clothing) unless it is a core part of the effect's mechanic.",
  "concepts": [
    {
      "id": "1",
      "title": "Concept Title",
      "environmentalContext": "Description of environment...",
      "emotionalMotivation": "Description of emotional driver...",
      "beforeVisualPrompt": "Detailed prompt for the 'Before' state...",
      "afterVisualPrompt": "Detailed prompt for the 'After' state (same subject/setting + effect)..."
    },
    ... (total 3 concepts)
  ]
}
`;

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: '',
  generalModel: 'gemini-2.5-flash',
  imageModel: 'gemini-2.5-flash-image',
  auditSystemPrompt: DEFAULT_AUDIT_PROMPT,
  consultantSystemPrompt: DEFAULT_CONSULTANT_PROMPT,
  localizerSystemPrompt: DEFAULT_LOCALIZER_PROMPT
};

// --- Type Augmentation for Environment & AI Studio ---
declare global {
  // Define AIStudio interface to match strict type requirements
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  // Correctly augment the Window interface to include aistudio and mammoth
  interface Window {
    aistudio?: AIStudio;
    mammoth?: any;
  }

  // Augment ImportMeta for Vite environment variables
  interface ImportMeta {
    env: {
      VITE_GEMINI_API_KEY?: string;
      [key: string]: any;
    };
  }
}
