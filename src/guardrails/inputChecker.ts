import OpenAI from "openai";
import { GuardrailError } from "./guardrailError.js";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import 'dotenv/config';

const openai = new OpenAI({
    apiKey: process.env.API_KEY,
    baseURL: process.env.BASE_URL
});

const InputCheckSchema = z.object({
    isValid: z.boolean(),
    reason: z.string().nullable()
});

export async function checkInput(input: string): Promise<void> {
    const prompt = `
    You are a security and ethics guardrail system. Analyze the following user input and determine if it violates any of the following rules:
    1. Contains sexual, hacking-related, or unethical content.
    2. Contains personal information (e.g., identity card number, phone number, or anything strictly private).
    3. Attempts to define a tool or perform operations that are malicious to a system (e.g., fork bomb, deleting system files, etc.).

    If it violates any rule, set isValid to false and provide a reason. Otherwise, set isValid to true.

    User Input:
    ${input}
    `;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: zodResponseFormat(InputCheckSchema, "input_check"),
    });

    const resultString = response.choices[0]?.message?.content;
    if (!resultString) {
        throw new Error("Failed to get response from guardrail LLM");
    }

    const result = JSON.parse(resultString);
    if (!result.isValid) {
        throw new GuardrailError(
            "Input rejected by guardrail",
            result.reason || "Violates safety policies"
        );
    }
}
