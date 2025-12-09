

import { GoogleGenAI, Part, Content } from "@google/genai";
import { AuditResult, ConsultantLevel, MoodCardData, ChatMessage, KnowledgeFile, DEFAULT_AUDIT_PROMPT, DEFAULT_CONSULTANT_PROMPT } from "../types";

/**
 * Helper to determine MIME type from extension if browser fails
 */
export const getMimeTypeFromExtension = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch(ext) {
        case 'pdf': return 'application/pdf';
        case 'csv': return 'text/csv';
        case 'txt': return 'text/plain';
        case 'md': return 'text/markdown';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'json': return 'application/json';
        case 'docx': return 'text/plain'; // Converted to text
        default: return 'application/octet-stream';
    }
};

/**
 * Helper: Get Effective API Key
 * Prioritizes Environment Key (AI Studio/IDX) > Vite Env Key > Manual Settings Key
 */
const getEffectiveApiKey = (manualKey: string): string => {
    // 1. Check process.env (AI Studio / IDX)
    // We use a safe check to avoid ReferenceError in browsers where process is not defined
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        return process.env.API_KEY;
    }
    // 2. Check Vite Environment Variable
    if (import.meta && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
        return import.meta.env.VITE_GEMINI_API_KEY;
    }
    // 3. Fallback to manually entered key
    return manualKey;
};

/**
 * Helper to Resize and Compress Image for Gemini
 * Max dimension: 800px (Optimized for Speed), Format: JPEG, Quality: 0.8
 */
export const processImageForGemini = async (file: File): Promise<{ base64: string, mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Max dimension 800 to ensure faster processing
        const MAX_SIZE = 800;
        if (width > MAX_SIZE || height > MAX_SIZE) {
            if (width > height) {
                height = Math.round((height * MAX_SIZE) / width);
                width = MAX_SIZE;
            } else {
                width = Math.round((width * MAX_SIZE) / height);
                height = MAX_SIZE;
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert to JPEG Base64
        const mimeType = 'image/jpeg';
        const dataUrl = canvas.toDataURL(mimeType, 0.8); 
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType });
      };
      img.onerror = () => reject(new Error("Failed to load image for processing"));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
};

/**
 * Deprecated: Use processImageForGemini instead
 */
export const fileToGenerativePart = async (file: File): Promise<string> => {
    const result = await processImageForGemini(file);
    return result.base64;
};

/**
 * Uploads a file to Gemini Files API and waits for it to be ACTIVE.
 * Returns both URI and corrected MIME type.
 */
export const uploadKnowledgeFile = async (
  file: File, 
  apiKey: string
): Promise<{ uri: string, mimeType: string }> => {
  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) throw new Error("API Key is required");

  let fileToUpload = file;
  const ext = file.name.split('.').pop()?.toLowerCase();

  // 0. SPECIAL HANDLER: Convert DOCX to Text
  if (ext === 'docx') {
      try {
          const arrayBuffer = await file.arrayBuffer();
          // Use global mammoth library (injected via index.html)
          if ((window as any).mammoth) {
              const result = await (window as any).mammoth.extractRawText({ arrayBuffer: arrayBuffer });
              const extractedText = result.value;
              const warning = result.messages.map((m: any) => m.message).join('\n');
              if (warning) console.warn("Docx conversion warnings:", warning);
              
              // Create a new Text file
              fileToUpload = new File([extractedText], file.name + ".txt", { type: "text/plain" });
          } else {
              throw new Error("Conversion library not loaded.");
          }
      } catch (docErr) {
          console.error("DOCX Conversion failed", docErr);
          throw new Error("Failed to read Word document. Please ensure it is a valid .docx file.");
      }
  } 
  // Pre-check for unsupported formats (that we can't convert)
  else if (['doc', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '')) {
      throw new Error(`.${ext} files are not supported directly. Please convert to PDF or .docx first.`);
  }

  const ai = new GoogleGenAI({ apiKey: effectiveKey });

  try {
    // 1. Upload
    const uploadResult = await ai.files.upload({
      file: fileToUpload,
      config: { displayName: file.name }
    });
    
    if (!uploadResult.uri || !uploadResult.name) {
        throw new Error("Upload failed: No URI or Name returned from API");
    }

    const fileUri: string = uploadResult.uri;
    const name: string = uploadResult.name; 
    
    // Determine MIME type
    let finalMimeType = uploadResult.mimeType;
    if (!finalMimeType) {
        finalMimeType = fileToUpload.type || getMimeTypeFromExtension(file.name);
    }

    // 2. Poll until ACTIVE
    let isActive = false;
    while (!isActive) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s
      const fileStatus = await ai.files.get({ name: name });
      if (fileStatus.state === 'ACTIVE') {
        isActive = true;
      } else if (fileStatus.state === 'FAILED') {
        throw new Error("File processing failed");
      }
    }

    return { uri: fileUri, mimeType: finalMimeType };
  } catch (error: any) {
    console.error("File Upload Error:", error);
    if (error.toString().includes("Unsupported MIME type") || (error.message && error.message.includes("Unsupported MIME type"))) {
        throw new Error("This file format is not supported by the API.");
    }
    // Check for Permission Denied (403)
    if (error.message?.includes("403") || error.toString().includes("403") || error.message?.includes("PERMISSION_DENIED")) {
        throw new Error("PERMISSION_DENIED_PRO_MODEL");
    }
    throw error;
  }
};

/**
 * Test API Connection
 */
export const testApiConnection = async (apiKey: string): Promise<boolean> => {
  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) return false;
  
  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  try {
    await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: 'Ping' }] }
    });
    return true;
  } catch (error) {
    console.error("API Test Failed", error);
    return false;
  }
};

/**
 * Helper to check if a file is supported for generation
 */
const isSupportedFileForGeneration = (mimeType?: string): boolean => {
    if (!mimeType) return false;
    return mimeType.startsWith('text/') || 
           mimeType.startsWith('image/') || 
           mimeType === 'application/pdf' ||
           mimeType === 'application/json';
};

/**
 * Feature 1: Cultural Audit with RAG Support
 */
export const performCulturalAudit = async (
  base64Image: string, 
  regions: string[], 
  knowledgeFiles: KnowledgeFile[],
  apiKey: string, 
  modelId: string,
  systemPrompt?: string
): Promise<AuditResult> => {
  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) throw new Error("API Key is required");
  
  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  
  const regionString = regions.length > 0 ? regions.join(", ") : "Global";

  // Split into Files vs Links - FILTER BY isActive
  const activeKnowledge = knowledgeFiles.filter(f => f.isActive);
  const files = activeKnowledge.filter(f => f.sourceType === 'FILE' && isSupportedFileForGeneration(f.mimeType));
  const links = activeKnowledge.filter(f => f.sourceType === 'LINK');

  // Construct Prompt with RAG Context
  let ragInstructions = "";
  if (activeKnowledge.length > 0) {
      ragInstructions = `
      CONTEXT FROM ATTACHED FILES & LINKS:
      You have access to attached knowledge base files and links.
      CRITICAL: Check these sources for specific prohibitions, color rules, or cultural mandates.
      ${links.length > 0 ? `External Links to consider: ${links.map(l => l.name).join(", ")}` : ""}
      If a finding is based on a rule from a file or link, explicitly cite the source name in the 'description' field like [Source: Name].
      `;
  }

  // Use Custom Prompt or Default
  let promptText = systemPrompt || DEFAULT_AUDIT_PROMPT;
  
  // Replace Placeholders
  promptText = promptText.replace('{{regions}}', regionString);
  promptText = promptText.replace('{{ragInstructions}}', ragInstructions);

  try {
    const parts: Part[] = [];

    // 1. Add File Data (Context)
    files.forEach(file => {
        if (file.uri && file.status === 'READY') {
            const safeMimeType = file.mimeType || getMimeTypeFromExtension(file.name);
            parts.push({ 
                fileData: { 
                    fileUri: file.uri, 
                    mimeType: safeMimeType 
                } 
            });
        }
    });

    // 2. Add Image
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
    
    // 3. Add Prompt
    parts.push({ text: promptText });

    const apiCall = ai.models.generateContent({
      model: modelId,
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
      }
    });

    const timeoutAction = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Request timed out. The image might be too complex or the service is busy.")), 90000)
    );

    const response = await Promise.race([apiCall, timeoutAction]) as any;

    if (!response.candidates || response.candidates.length === 0) {
        throw new Error("The AI could not analyze this image due to safety filters.");
    }
    const finishReason = response.candidates[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        if (finishReason === 'SAFETY') throw new Error("The image was flagged by safety filters.");
    }

    let jsonText = response.text || "";
    
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        jsonText = jsonMatch[0];
    } else {
        jsonText = jsonText.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
    }
    
    if (!jsonText) throw new Error("No valid JSON response received from Gemini.");

    let raw;
    try {
        raw = JSON.parse(jsonText);
    } catch (parseError) {
        console.error("JSON Parse Error in Audit:", parseError, "Raw Text:", response.text);
        throw new Error("Failed to process the AI analysis. Please try again.");
    }
    
    const result: AuditResult = {
      region: raw.region || regionString,
      annotations: Array.isArray(raw.annotations) ? raw.annotations : []
    };
    
    return result;

  } catch (error: any) {
    console.error("Audit Error:", error);
    if (error.message?.includes("403") || error.toString().includes("403") || error.message?.includes("PERMISSION_DENIED")) {
        throw new Error("PERMISSION_DENIED_PRO_MODEL");
    }
    throw error;
  }
};

/**
 * Feature 1 Extension: Generate Fix (Swap & Fix)
 */
export const generateAlternativeImage = async (
  prompt: string, 
  apiKey: string, 
  modelId: string
): Promise<string> => {
  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) throw new Error("API Key is required");

  const ai = new GoogleGenAI({ apiKey: effectiveKey });

  const imageConfig: any = {
      aspectRatio: "1:1",
  };

  if (modelId.includes('gemini-3-pro-image')) {
      imageConfig.imageSize = "1K";
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        imageConfig: imageConfig
      }
    });

    const candidate = response.candidates?.[0];
    if (!candidate || candidate.finishReason === 'SAFETY') {
        throw new Error("Image generation blocked.");
    }

    const parts = candidate.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image data found in response.");
  } catch (error: any) {
    console.error("Generation Error:", error);
    if (error.message?.includes("403") || error.toString().includes("403") || error.message?.includes("PERMISSION_DENIED")) {
        throw new Error("PERMISSION_DENIED_PRO_MODEL");
    }
    throw new Error(error.message || "Failed to generate image.");
  }
};

/**
 * Feature 2: Cultural Consultant Chat (RAG + Web Search)
 */
export const consultCulturalAgent = async (
  query: string, 
  history: ChatMessage[], 
  level: ConsultantLevel,
  audience: string[],
  knowledgeFiles: KnowledgeFile[], 
  apiKey: string, 
  modelId: string,
  chatImagesBase64?: string[],
  enableSearch: boolean = false,
  systemPrompt?: string,
  onStreamUpdate?: (partialText: string) => void
): Promise<{ text: string, moodCards?: MoodCardData[], citedSources?: string[], groundingMetadata?: any }> => {
  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) return { text: "API Key Missing. Please configure it in settings." };

  const ai = new GoogleGenAI({ apiKey: effectiveKey });
  
  const audienceStr = audience.length > 0 ? audience.join(", ") : "Global/General";
  
  const modeInstructions = level === ConsultantLevel.FAST 
    ? "FAST MODE: Be simple and quick. Give practical colors (Hex codes) and clear icons immediately." 
    : "DEEP MODE: Explain the history and meaning, but keep it concise.";

  // FILTER BY isActive
  const activeKnowledge = knowledgeFiles.filter(f => f.isActive);
  const files = activeKnowledge.filter(f => f.sourceType === 'FILE' && isSupportedFileForGeneration(f.mimeType));
  const links = activeKnowledge.filter(f => f.sourceType === 'LINK');

  let ragInstructions = "";
  if (activeKnowledge.length > 0) {
      ragInstructions = `
      PRIORITY SOURCES:
      1. Attached Files: ${files.map(f => f.name).join(", ")}.
      ${enableSearch ? `2. External Links (use googleSearch): ${links.map(l => l.name).join(", ")}.` : ""}
      
      INSTRUCTION:
      - FIRST check the Attached Files for answers.
      ${enableSearch ? `- THEN check the External Links using 'googleSearch'.` : ""}
      - CITATION RULE: You MUST cite your sources INLINE immediately following the information retrieved. 
        Format: "...fact (Source: Filename)" or "...fact (Source: URL)".
      `;
  }

  let systemInstruction = systemPrompt || DEFAULT_CONSULTANT_PROMPT;
  
  systemInstruction = systemInstruction.replace('{{audience}}', audienceStr);
  systemInstruction = systemInstruction.replace('{{modeInstructions}}', modeInstructions);
  systemInstruction = systemInstruction.replace('{{ragInstructions}}', ragInstructions);

    const historyContents: Content[] = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text || "" }]
    }));

    const parts: Part[] = [];

    files.forEach(file => {
        if (file.uri && file.status === 'READY') {
            const safeMimeType = file.mimeType || getMimeTypeFromExtension(file.name);
            parts.push({ 
                fileData: { 
                    fileUri: file.uri, 
                    mimeType: safeMimeType
                } 
            });
        }
    });

    if (chatImagesBase64 && chatImagesBase64.length > 0) {
        chatImagesBase64.forEach(img => {
             parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: img
                }
            });
        });
        parts.push({ text: "Image(s) context provided above." });
    }

    parts.push({ text: `User Query: ${query}` });

    const userContent: Content = {
        role: 'user',
        parts: parts
    };
    
    const fullContents = [...historyContents, userContent];

    let resultStream;
    const tools = enableSearch ? [{ googleSearch: {} }] : undefined;

    try {
        resultStream = await ai.models.generateContentStream({
            model: modelId,
            contents: fullContents,
            config: {
                systemInstruction,
                tools: tools
            }
        });
    } catch (err: any) {
        console.error("Consultant: Streaming failed", err);
        if (err.message?.includes("403") || err.toString().includes("403") || err.message?.includes("PERMISSION_DENIED")) {
            throw new Error("PERMISSION_DENIED_PRO_MODEL");
        }
        throw err;
    }

    let finalStreamText = '';
    let groundingMetadata;

    try {
        for await (const chunk of resultStream) {
            const textChunk = chunk.text;
            if (textChunk) {
                finalStreamText += textChunk;
                if (onStreamUpdate) {
                    onStreamUpdate(finalStreamText);
                }
            }
            if (chunk.candidates?.[0]?.groundingMetadata) {
                groundingMetadata = chunk.candidates[0].groundingMetadata;
            }
        }
    } catch (streamErr: any) {
        console.error("Error during streaming", streamErr);
        if (streamErr.message?.includes("403") || streamErr.toString().includes("403") || streamErr.message?.includes("PERMISSION_DENIED")) {
            throw new Error("PERMISSION_DENIED_PRO_MODEL");
        }
        throw streamErr;
    }

    let finalText = finalStreamText;
    let moodCards: MoodCardData[] | undefined;
    let citedSources: string[] | undefined;

    const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```\s*$/;
    const match = finalStreamText.match(jsonBlockRegex);

    if (match) {
        try {
            const jsonStr = match[1];
            const data = JSON.parse(jsonStr);
            
            if (data.moodCards) moodCards = data.moodCards;
            if (data.citedSources) citedSources = data.citedSources;
            
            finalText = finalStreamText.replace(jsonBlockRegex, '').trim();
        } catch (e) {
            console.warn("Failed to parse appended JSON structure", e);
        }
    }

    return {
      text: finalText,
      moodCards: moodCards,
      citedSources: citedSources,
      groundingMetadata: groundingMetadata
    };
};
