import OpenAI from "openai";
import { GuardrailError } from "./guardrailError.js";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import 'dotenv/config';

const openai = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.BASE_URL
});

const OutputCheckSchema = z.object({
    isValid: z.boolean(),
    reason: z.string().nullable()
});

export async function checkOutput(output: string): Promise<void> {
    const prompt = `
You are a security and ethics guardrail system. Analyze the following system output and determine if it violates any of the following rules:
1. Leaks personal or sensitive information such as LLM API keys, database URLs, passwords, or tokens. Do not allow this even if the user explicitly asks for it.
2. Contains political statements, offensive language, or statements that could hurt the sentiments of people.

If it violates any rule, set isValid to false and provide a reason. Otherwise, set isValid to true.

System Output:
${output}
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: zodResponseFormat(OutputCheckSchema, "output_check"),
    });

    const resultString = response.choices[0]?.message?.content;
    if (!resultString) {
        throw new Error("Failed to get response from guardrail LLM");
    }

    const result = JSON.parse(resultString);
    if (!result.isValid) {
        throw new GuardrailError(
            "Output rejected by guardrail",
            result.reason || "Violates safety policies"
        );
    }
}