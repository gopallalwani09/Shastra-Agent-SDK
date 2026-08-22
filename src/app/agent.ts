import { zodFunction } from "openai/helpers/zod.mjs";
import { HARNESS_PROMPT } from "./config.js";
import Openai from 'openai'
import type { ChatCompletionTool } from 'openai/resources/chat/completions.mjs';
import type {
    ChatCompletionMessageParam
} from "openai/resources/chat/completions";
import * as z from "zod";
import type { ZodType } from "zod";
import 'dotenv/config'

type IMessage = ChatCompletionMessageParam;

export interface ITool<Input, Result> {
    name: string
    description: string
    doc?: string
    inputSchema: ZodType<Input>
    executor: (input: Input) => Promise<Result>
}

export class ShastraBuilder {
    public instructions: string | undefined
    public toolList: ITool<any, any>[]

    constructor() {
        this.toolList = [];
    }

    public setIntructions(instructions: string) {
        this.instructions = instructions
        return this
    }

    public tool(t: ITool<any, any>) {
        this.toolList.push(t)
        return this
    }

    public build() {
        return new Shastra(this)
    }
}


export class Shastra {
    private instructions: string
    private messageHistory: ChatCompletionMessageParam[]
    private openai: Openai
    private agentToolList: ITool<any, any>[]
    private openAITools: ChatCompletionTool[]

    private MAX_LOOP = 30

    constructor(builder: ShastraBuilder) {
        this.openai = new Openai({
            apiKey: process.env.API_KEY,
            baseURL: process.env.BASE_URL
        })

        this.agentToolList = builder.toolList;
        this.openAITools = this.agentToolList.map(tool => zodFunction({
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
        }));


        this.instructions = `
            ${HARNESS_PROMPT} \n\n

            System Prompt:
            ${builder.instructions}

            Available Tools:
            ${builder.toolList.map((t) => JSON.stringify({ functionName: t.name, functionDescription: t.description, functionDoc: t.doc, })).join('\n')}
        `

        this.messageHistory = []
    }

    static builder() {
        return new ShastraBuilder()
    }

    public printSystemPrompt() {
        console.log(this.instructions);
    }


    public async run(query: string) {
        this.messageHistory.push({ role: "user", content: query })
        
        try {
            while(true){
                const llmResponse = await this.openai.chat.completions.create({
                    model: 'openai/gpt-4o',
                    messages: [
                        { role: 'system', content: this.instructions },
                        ...this.messageHistory
                    ],
                    ...(this.openAITools.length > 0 && {
                        tools: this.openAITools,
                        tool_choice: 'auto'
                    })
                })

                const llmcall = llmResponse.choices[0]?.message
                
                

                if (!llmcall) {
                    throw new Error("No response received from LLM");
                }

                this.messageHistory.push({
                    role: "assistant",
                    content: llmcall.content,
                    ...(llmcall.tool_calls
                        ? { tool_calls: llmcall.tool_calls }
                        : {})
                });

                if(!llmcall.tool_calls?.length) return llmResponse;

                // console.log(this.messageHistory[this.messageHistory.length - 1]);

                if (llmcall?.tool_calls) {

                    for (const toolCall of llmcall.tool_calls) {
                        if (toolCall.type !== "function") {
                            continue;
                        }
                        const toolName = toolCall.function.name
                        const tool = this.agentToolList.find((tool) => tool.name === toolName)

                        if(!tool) {
                            throw new Error(
                                `Tool "${toolName}" was requested but not found`
                            );
                        }

                        let args;
                        try {
                            args = JSON.parse(toolCall.function.arguments)
                        } catch (error) {
                            throw new Error(
                                `Invalid JSON arguments for tool "${toolName}"`
                            );
                        }
                        const validatedArgs = tool.inputSchema.parse(args);

                        // Execute actual function
                        const result = await tool.executor(validatedArgs);
                        this.messageHistory.push({role:'tool', tool_call_id: toolCall.id, content:JSON.stringify(result)}) 
                    }
                }
            
            }

        } catch (error) {
            console.error(error);
        }
    }
}