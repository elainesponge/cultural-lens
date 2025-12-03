import { GoogleGenAI, Part, Content } from "@google/genai";
import { AuditResult, ConsultantLevel, MoodCardData, ChatMessage, KnowledgeFile, DEFAULT_AUDIT_PROMPT, DEFAULT_CONSULTANT_PROMPT } from "../types";

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
 */
export const uploadKnowledgeFile = async (
  file: File, 
  apiKey: string
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required");
  const ai = new GoogleGenAI({ apiKey });

  try {
    // 1. Upload
    const uploadResult = await ai.files.upload({
      file: file,
      config: { displayName: file.name }
    });
    
    // Fix: Ensure uri and name are strings (handle undefined from SDK type)
    if (!uploadResult.uri || !uploadResult.name) {
        throw new Error("Upload failed: No URI or Name returned from API");
    }

    const fileUri: string = uploadResult.uri;
    const name: string = uploadResult.name; // This is the API name (files/xyz), not display name

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

    return fileUri;
  } catch (error: any) {
    console.error("File Upload Error:", error);
    if (error.toString().includes("Unsupported MIME type") || (error.message && error.message.includes("Unsupported MIME type"))) {
        throw new Error("This file format is not supported by the API. If uploading Word/Excel, please try saving as PDF or CSV.");
    }
    throw error;
  }
};

/**
 * Test API Connection
 * Verifies if the API Key is valid by making a minimal request.
 */
export const testApiConnection = async (apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;
  const ai = new GoogleGenAI({ apiKey });
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
  if (!apiKey) throw new Error("API Key is required");
  
  const ai = new GoogleGenAI({ apiKey });
  
  const regionString = regions.length > 0 ? regions.join(", ") : "Global";

  // Split into Files vs Links
  const files = knowledgeFiles.filter(f => f.sourceType === 'FILE');
  const links = knowledgeFiles.filter(f => f.sourceType === 'LINK');

  // Construct Prompt with RAG Context
  let ragInstructions = "";
  if (knowledgeFiles.length > 0) {
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
    // Construct Request Parts
    const parts: Part[] = [];

    // 1. Add File Data (Context)
    files.forEach(file => {
        if (file.uri && file.status === 'READY') {
            parts.push({ 
                fileData: { 
                    fileUri: file.uri, 
                    mimeType: file.mimeType || 'application/pdf'
                } 
            });
        }
    });

    // 2. Add Image (Optimized JPEG)
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: base64Image } });
    
    // 3. Add Prompt
    parts.push({ text: promptText });

    // 4. Call API with Timeout Race
    // NOTE: We remove strict 'responseSchema' here to improve compatibility with Pro Preview models 
    // which sometimes fail strict schema validation. We rely on the prompt + JSON parsing logic instead.
    const apiCall = ai.models.generateContent({
      model: modelId,
      contents: { parts: parts },
      config: {
        responseMimeType: "application/json",
      }
    });

    // Pro models are slower, increase timeout to 90s
    const timeoutAction = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Request timed out. The image might be too complex or the service is busy.")), 90000)
    );

    const response = await Promise.race([apiCall, timeoutAction]) as any;

    // Check for Safety Blocks
    if (!response.candidates || response.candidates.length === 0) {
        throw new Error("The AI could not analyze this image due to safety filters.");
    }
    const finishReason = response.candidates[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        console.warn("Audit finished with reason:", finishReason);
        if (finishReason === 'SAFETY') throw new Error("The image was flagged by safety filters.");
    }

    // --- FIX START: ROBUST JSON PARSING ---
    let jsonText = response.text || "";
    
    // 1. Try to find a JSON object using Regex (ignores markdown blocks or preamble)
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        jsonText = jsonMatch[0];
    } else {
        // Fallback cleanup if regex fails but it looks like markdown
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
    // --- FIX END ---
    
    // Sanitize response to ensure strict type compliance
    const result: AuditResult = {
      region: raw.region || regionString,
      annotations: Array.isArray(raw.annotations) ? raw.annotations : []
    };
    
    return result;

  } catch (error) {
    console.error("Audit Error:", error);
    throw error;
  }
};

/**
 * Feature 1 Extension: Generate Fix (Swap & Fix)
 * AND Feature 2 Extension: Generate Mood Card Visuals
 */
export const generateAlternativeImage = async (
  prompt: string, 
  apiKey: string, 
  modelId: string
): Promise<string> => {
  if (!apiKey) throw new Error("API Key is required");

  const ai = new GoogleGenAI({ apiKey });

  // CONFIGURATION FIX: 
  // imageSize is ONLY supported on 'gemini-3-pro-image-preview'. 
  // Sending it to 'gemini-2.5-flash-image' causes 500 Internal Error.
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

    // Check Safety & Finish Reason
    const candidate = response.candidates?.[0];
    if (!candidate) {
        throw new Error("No candidates returned. Request might have been blocked.");
    }
    
    if (candidate.finishReason === 'SAFETY') {
        throw new Error("Image generation blocked by safety filters.");
    }

    // Iterate parts to find the image
    const parts = candidate.content?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.inlineData && part.inlineData.data) {
            // Return data URL
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    
    console.warn("No image part found in response:", response);
    throw new Error("No image data found in response.");
  } catch (error: any) {
    console.error("Generation Error:", error);
    // Rethrow with clear message
    throw new Error(error.message || "Failed to generate image.");
  }
};

/**
 * Feature 2: Cultural Consultant Chat (RAG + Web Search)
 * UPDATED: Uses generateContentStream for faster performance
 */
export const consultCulturalAgent = async (
  query: string, 
  history: ChatMessage[], 
  level: ConsultantLevel,
  audience: string[],
  knowledgeFiles: KnowledgeFile[], 
  apiKey: string, 
  modelId: string,
  chatImagesBase64?: string[], // CHANGED: Accept array of strings
  enableSearch: boolean = false, // OPTIMIZATION: Toggle search to improve speed
  systemPrompt?: string,
  onStreamUpdate?: (partialText: string) => void
): Promise<{ text: string, moodCards?: MoodCardData[], citedSources?: string[], groundingMetadata?: any }> => {
  if (!apiKey) return { text: "API Key Missing. Please configure it in settings." };

  const ai = new GoogleGenAI({ apiKey });
  
  const audienceStr = audience.length > 0 ? audience.join(", ") : "Global/General";
  
  const modeInstructions = level === ConsultantLevel.FAST 
    ? "FAST MODE: Be simple and quick. Give practical colors (Hex codes) and clear icons immediately." 
    : "DEEP MODE: Explain the history and meaning, but keep it concise.";

  // Split into Files vs Links
  const files = knowledgeFiles.filter(f => f.sourceType === 'FILE');
  const links = knowledgeFiles.filter(f => f.sourceType === 'LINK');

  // Construct system prompts
  let ragInstructions = "";
  if (knowledgeFiles.length > 0) {
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

  // Use Custom Prompt or Default
  let systemInstruction = systemPrompt || DEFAULT_CONSULTANT_PROMPT;
  
  // Replace Placeholders
  systemInstruction = systemInstruction.replace('{{audience}}', audienceStr);
  systemInstruction = systemInstruction.replace('{{modeInstructions}}', modeInstructions);
  systemInstruction = systemInstruction.replace('{{ragInstructions}}', ragInstructions);

    // 1. Prepare History
    const historyContents: Content[] = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text || "" }]
    }));

    // 2. Prepare Current User Message
    const parts: Part[] = [];

    // Add file data references
    files.forEach(file => {
        if (file.uri && file.status === 'READY') {
            parts.push({ 
                fileData: { 
                    fileUri: file.uri, 
                    mimeType: file.mimeType || 'application/pdf'
                } 
            });
        }
    });

    // Add user uploaded images (Chat Images)
    if (chatImagesBase64 && chatImagesBase64.length > 0) {
        chatImagesBase64.forEach(img => {
             parts.push({
                inlineData: {
                    mimeType: 'image/jpeg', // Using processImageForGemini guarantees JPEG
                    data: img
                }
            });
        });
        parts.push({ text: "Image(s) context provided above." });
    }

    // Add user text
    parts.push({ text: `User Query: ${query}` });

    const userContent: Content = {
        role: 'user',
        parts: parts
    };
    
    const fullContents = [...historyContents, userContent];

    let resultStream;
    
    // Config Tools based on user preference
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
    } catch (err) {
        console.error("Consultant: Streaming failed", err);
        throw err;
    }

    // Process Stream
    let finalStreamText = '';
    let groundingMetadata;

    try {
        // Fix: Iterate over resultStream directly, not resultStream.stream
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
    } catch (streamErr) {
        console.error("Error during streaming", streamErr);
        throw streamErr;
    }

    // Post-Processing: Extract JSON Block for Mood Cards
    let finalText = finalStreamText;
    let moodCards: MoodCardData[] | undefined;
    let citedSources: string[] | undefined;

    // Regex to find the LAST valid JSON block in the text (often at end)
    const jsonBlockRegex = /```json\s*(\{[\s\S]*?\})\s*```\s*$/;
    const match = finalStreamText.match(jsonBlockRegex);

    if (match) {
        try {
            const jsonStr = match[1];
            const data = JSON.parse(jsonStr);
            
            if (data.moodCards) moodCards = data.moodCards;
            if (data.citedSources) citedSources = data.citedSources;
            
            // Clean the JSON from the displayed text
            finalText = finalStreamText.replace(jsonBlockRegex, '').trim();
        } catch (e) {
            console.warn("Failed to parse appended JSON structure", e);
            // We leave text as is if parsing fails
        }
    }

    return {
      text: finalText,
      moodCards: moodCards,
      citedSources: citedSources,
      groundingMetadata: groundingMetadata
    };
};