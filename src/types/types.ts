import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface RunContext {
    messages: ChatCompletionMessageParam[];
    depth: number;
}