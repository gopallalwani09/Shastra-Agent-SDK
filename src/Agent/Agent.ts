import type { ITool } from "../types/Tool.js";

export interface ShastraConfig {
    name: string;
    description: string;
    instructions: string;

    tools?: ITool<any, any>[];
    agents?: Shastra[];
}

export class Shastra {

    public readonly name: string;
    public readonly description: string;
    public readonly instructions: string;

    public readonly tools: ITool<any, any>[];
    public readonly agents: Shastra[];

    constructor(config: ShastraConfig) {

        this.name = config.name;
        this.description = config.description;
        this.instructions = config.instructions;

        this.tools = config.tools ?? [];
        this.agents = config.agents ?? [];
    }
}