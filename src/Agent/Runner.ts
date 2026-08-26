import OpenAI from "openai";
import { zodFunction, zodResponseFormat } from "openai/helpers/zod.mjs";
import type {
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletionMessageToolCall
} from "openai/resources/chat/completions";

import * as z from "zod";

import { Shastra } from "./Agent.js";
import type { ITool } from "../types/Tool.js";
import type { RunContext } from "../types/types.js";
import { HARNESS_PROMPT } from "./config.js";
import 'dotenv/config';
import { checkInput } from "../guardrails/inputChecker.js";
import { checkOutput } from "../guardrails/outputChecker.js";

export let globalContext: RunContext = {
    messages: [],
    depth: 0
};

export function resetGlobalContext(): void {
    globalContext = {
        messages: [],
        depth: 0
    };
}

export class Runner {

    private readonly openai: OpenAI;

    private readonly MAX_LOOP = 30;
    private readonly MAX_DEPTH = 10;
    public context: RunContext = globalContext;

    constructor() {

        this.openai = new OpenAI({
            apiKey: process.env.API_KEY,
            baseURL: process.env.BASE_URL
        });
    }

    public getContext(): RunContext {
        return globalContext;
    }

    public resetContext(): void {
        resetGlobalContext();
        this.context = globalContext;
    }

    public async run(
        agent: Shastra,
        query: string
    ) {

        await checkInput(query);

        globalContext.messages.push({
            role: "user",
            content: query
        });
        globalContext.depth = 0;
        this.context = globalContext;

        return this.execute(agent, globalContext);
    }

    private async execute(
        agent: Shastra,
        context: RunContext
    ) {

        if (context.depth > this.MAX_DEPTH) {
            throw new Error(
                `Maximum agent depth of ${this.MAX_DEPTH} exceeded`
            );
        }

        const tools = this.buildTools(agent);

        for (
            let iteration = 0;
            iteration < this.MAX_LOOP;
            iteration++
        ) {
            // instead of every response to be forced to be in the particular json schema can we call a llm response at the if block where we are checking is there any tool call so that we do not have to do this for every response 
            const response =
                await this.openai.chat.completions.create({

                    model: "openai/gpt-4o",

                    messages: [
                        {
                            role: "system",
                            content: `
                                ${HARNESS_PROMPT}

                                Agent Instructions:
                                ${agent.instructions}
                            `
                        },
                        ...context.messages
                    ],

                    ...(tools.length > 0 && {
                        tools,
                        tool_choice: "auto"
                    }),
                });

            const message =
                response.choices[0]?.message;

            if (!message) {
                throw new Error(
                    "No response received from LLM"
                );
            }

            // Store assistant response
            context.messages.push(message);

            // No tool calls means final answer
            if (!message.tool_calls?.length) {
                const structuredResponse = await this.openai.chat.completions.create({
                    model: "openai/gpt-4o",
                    messages: [
                        {
                            role: 'assistant',
                            content: message.content
                        }
                    ],
                    ...(agent.outputSchema && {
                        response_format: zodResponseFormat(
                            agent.outputSchema,
                            `${agent.name}_output`
                        )
                    })

                })
                const finalOutput = structuredResponse.choices[0]?.message.content;
                if (finalOutput) {
                    await checkOutput(finalOutput);
                }
                return finalOutput;
            }

            // Execute tools / handoffs
            await this.executeToolCalls(
                agent,
                message.tool_calls,
                context
            );
        }

        throw new Error(
            `Maximum execution loop of ${this.MAX_LOOP} iterations exceeded`
        );
    }

    private buildTools(
        agent: Shastra
    ): ChatCompletionTool[] {

        const normalTools =
            agent.tools.map(tool =>
                zodFunction({
                    name: tool.name,
                    description: tool.description,
                    parameters: tool.inputSchema
                })
            );

        const handoffTools =
            agent.agents.map(targetAgent =>
                zodFunction({
                    name: `handoff_to_${targetAgent.name}`,

                    description:
                        `Hand off the task to ${targetAgent.name}. ` +
                        targetAgent.description,

                    parameters: z.object({
                        input: z.string()
                    })
                })
            );

        return [
            ...normalTools,
            ...handoffTools
        ];
    }

    // --------------------------------------------------
    // EXECUTE ALL TOOL CALLS
    // --------------------------------------------------

    private async executeToolCalls(
        agent: Shastra,
        toolCalls: ChatCompletionMessageToolCall[],
        context: RunContext
    ) {

        for (const toolCall of toolCalls) {

            if (toolCall.type !== "function") {
                continue;
            }

            const toolName =
                toolCall.function.name;

            // ------------------------------------------
            // CHECK HANDOFF
            // ------------------------------------------

            const targetAgent =
                agent.agents.find(
                    child =>
                        `handoff_to_${child.name}` ===
                        toolName
                );

            if (targetAgent) {

                await this.executeHandoff(
                    targetAgent,
                    toolCall,
                    context
                );

                continue;
            }

            // ------------------------------------------
            // CHECK NORMAL TOOL
            // ------------------------------------------

            const tool =
                agent.tools.find(
                    tool => tool.name === toolName
                );

            if (!tool) {
                throw new Error(
                    `Tool "${toolName}" was requested but not found`
                );
            }

            await this.executeTool(
                tool,
                toolCall,
                context
            );
        }
    }

    // --------------------------------------------------
    // EXECUTE NORMAL TOOL
    // --------------------------------------------------

    private async executeTool(
        tool: ITool<any, any>,
        toolCall: ChatCompletionMessageToolCall & { type: "function" },
        context: RunContext
    ) {

        let args: unknown;

        try {

            args = JSON.parse(
                toolCall.function.arguments
            );

        } catch {

            throw new Error(
                `Invalid JSON arguments for tool "${tool.name}"`
            );
        }

        // Validate with Zod
        const validatedArgs =
            tool.inputSchema.parse(args);

        // Execute actual function
        const result =
            await tool.executor(validatedArgs);

        // Send result back to LLM
        context.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(result)
        });
    }

    // --------------------------------------------------
    // EXECUTE HANDOFF
    // --------------------------------------------------

    private async executeHandoff(
        targetAgent: Shastra,
        toolCall: ChatCompletionMessageToolCall & { type: "function" },
        context: RunContext
    ) {

        let args: {
            input: string;
        };

        try {

            args = JSON.parse(
                toolCall.function.arguments
            );

        } catch {

            throw new Error(
                `Invalid JSON arguments for handoff to "${targetAgent.name}"`
            );
        }

        if (
            !args ||
            typeof args.input !== "string"
        ) {

            throw new Error(
                `Invalid input for handoff to "${targetAgent.name}"`
            );
        }

        // Create child context
        const childContext: RunContext = {

            messages: [
                {
                    role: "user",
                    content: args.input
                }
            ],

            depth: context.depth + 1
        };

        // Run target agent
        const result =
            await this.execute(
                targetAgent,
                childContext
            );

        // Extract final content
        const finalMessage =
            result;

        const content =
            finalMessage  ?? "";

        // Give child result back to parent agent
        context.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content
        });
    }
}