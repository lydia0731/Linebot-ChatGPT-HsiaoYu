import type { OpenAIService } from "./openai.service.js";

export class ChatService {
  constructor(private readonly openAi: OpenAIService) {}

  handleChatMessage(message: string): Promise<string> {
    return this.openAi.answer(message);
  }
}
