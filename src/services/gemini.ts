import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export type AdvisorMode = 'friend' | 'doctor' | 'parent' | 'coach';

const ADVISOR_PROMPTS: Record<AdvisorMode, string> = {
  friend: "Talk like a supportive, empathetic friend. Use casual but caring language.",
  doctor: "Respond professionally like a knowledgeable health educator. Be clear, clinical but accessible, and authoritative.",
  parent: "Respond in a warm, caring, and protective tone. Like a wise parent looking out for their child.",
  coach: "Respond like a high-energy motivational coach. Focus on action, discipline, and positive reinforcement."
};

export interface AIResponse {
  text: string;
  emotion: string;
  language: string;
  audioBase64?: string;
}

export async function getHealthcareAdvice(
  userInput: string,
  mode: AdvisorMode,
  generateAudio: boolean = false
): Promise<AIResponse> {
  const model = ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: userInput,
    config: {
      systemInstruction: `You are Vitalis, a calm healthcare AI assistant.
      
      Communication style: ${ADVISOR_PROMPTS[mode]}
      
      Tasks:
      1. Understand symptoms mentioned.
      2. Explain possible common causes (without diagnosing).
      3. Suggest healthy foods and lifestyle advice.
      4. Avoid creating panic.
      5. Detect the user's emotion and language.
      
      CRITICAL: You MUST end every response with exactly this disclaimer: "This information is educational and not medical diagnosis."
      
      Return your response in JSON format.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "The main healthcare advice text." },
          emotion: { type: Type.STRING, description: "The detected emotion of the user (e.g., positive, stressed, neutral)." },
          language: { type: Type.STRING, description: "The detected language of the user input." }
        },
        required: ["text", "emotion", "language"]
      }
    }
  });

  try {
    const result = await model;
    let data: any;
    try {
      data = JSON.parse(result.text || "{}");
    } catch (e) {
      console.error("Failed to parse AI response as JSON:", result.text);
      data = {
        text: result.text || "I'm sorry, I couldn't process that request.",
        emotion: "neutral",
        language: "unknown"
      };
    }

    let audioBase64: string | undefined;

    if (generateAudio && data.text) {
      try {
        const ttsResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: data.text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: mode === 'doctor' ? 'Charon' : 'Kore' },
              },
            },
          },
        });
        audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      } catch (error: any) {
        console.error("TTS Error:", error);
        // Don't fail the whole request if just TTS fails, but log if it's quota
        if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
          console.warn("TTS Quota exceeded");
        }
      }
    }

    return {
      ...data,
      audioBase64
    };
  } catch (error: any) {
    if (error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new Error("QUOTA_EXCEEDED");
    }
    throw error;
  }
}
