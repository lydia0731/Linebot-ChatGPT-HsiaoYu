import OpenAI from "openai";
import { ExternalServiceError } from "../shared/errors.js";
import type { Logger } from "../shared/logger.js";

export class OpenAIService {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly model: string,
    private readonly systemPrompt: string,
    private readonly timeoutMs: number,
    private readonly logger: Logger
  ) {
    this.client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }

  async answer(message: string): Promise<string> {
    try {
      const response = await this.client.responses.create({
        model: this.model,
        instructions: this.systemPrompt,
        input: message
      }, { timeout: this.timeoutMs });
      const answer = response.output_text.trim();
      if (!answer) throw new Error("OpenAI response is empty");
      return answer;
    } catch (error) {
      this.logger.error({ err: error }, "OpenAI request failed");
      throw new ExternalServiceError("OpenAI 暫時無法回答", error);
    }
  }
}
