import { Injectable } from '@angular/core';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

@Injectable({ providedIn: 'root' })
export class GeminiService {
  private ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  async transcribeAudio(base64Audio: string, mimeType: string, useThinking: boolean): Promise<string> {
    const textPrompt = useThinking 
      ? "Transcribe the audio exactly. If some words were missed or incorrectly transcribed, process them and fill in the gaps. Combine spoken sentences into continuous proper paragraphs. Do not improve or change the meaning, just correct the gaps. Output just the exact text formatting it as good paragraphs."
      : "Transcribe the audio exactly. Combine spoken sentences into continuous proper paragraphs, fixing irregular breaks. Reply with ONLY the transcription and nothing else.";

    const config = useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : undefined;
    const modelInfo = useThinking ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";

    const response = await this.ai.models.generateContent({
      model: modelInfo,
      contents: [
        { inlineData: { data: base64Audio, mimeType } },
        { text: textPrompt }
      ],
      config
    });
    return response.text || '';
  }

  async extractTextFromImage(base64Image: string, mimeType: string, useThinking: boolean): Promise<string> {
    const textPrompt = useThinking
      ? "Extract the exact text from this image. If some words were missed or illegible, process them and fill in the gaps accurately based on the context. Ignore physical line breaks found in the original image so it forms proper continuous paragraphs. Do not output text like a poem with arbitrary line breaks. Do not add commentary. Output ONLY the text."
      : "Extract exact text from this image. Ignore physical line breaks found in the original image so it forms proper continuous paragraphs. Do not output text like a poem with arbitrary line breaks. Output ONLY the extracted text.";

    const config = useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH } } : undefined;
    const modelInfo = useThinking ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";

    const response = await this.ai.models.generateContent({
      model: modelInfo,
      contents: [
        { inlineData: { data: base64Image, mimeType } },
        { text: textPrompt }
      ],
      config
    });
    return response.text || '';
  }

  async summarize3Words(text: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Provide a 3-word summary title for this text. Reply with ONLY the 3 words and nothing else:\n\n${text.substring(0, 1000)}`
      });
      return response.text?.replace(/["']/g, '').trim() || 'New Document';
    } catch {
      return 'New Document';
    }
  }
}
