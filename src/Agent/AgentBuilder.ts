import { Shastra } from "./Agent.js";
import type { ITool } from "../types/Tool.js";
import type { ZodType } from "zod";

export class ShastraBuilder {

    private _name?: string;
    private _description?: string;
    private _instructions?: string;

    private _tools: ITool<any, any>[] = [];
    private _agents: Shastra[] = [];
    private _outputSchema?: ZodType<any>;

    public name(name: string) {
        this._name = name;
        return this;
    }

    public description(description: string) {
        this._description = description;
        return this;
    }

    public instructions(instructions: string) {
        this._instructions = instructions;
        return this;
    }

    public tool(tool: ITool<any, any>) {
        this._tools.push(tool);
        return this;
    }

    public agent(agent: Shastra) {
        this._agents.push(agent);
        return this;
    }

    public outputSchema(schema: ZodType<any>) {
        this._outputSchema = schema;
        return this;
    }

    public build(): Shastra {

        if (!this._name) {
            throw new Error("Agent name is required");
        }

        if (!this._description) {
            throw new Error("Agent description is required");
        }

        if (!this._instructions) {
            throw new Error("Agent instructions are required");
        }

        return new Shastra({
            name: this._name,
            description: this._description,
            instructions: this._instructions,
            tools: this._tools,
            agents: this._agents,
            outputSchema: this._outputSchema
        });
    }
}