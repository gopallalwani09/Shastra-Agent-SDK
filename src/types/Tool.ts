import type { ZodType } from "zod";

export interface ITool<Input, Result> {
    name: string;
    description: string;
    doc?: string;

    inputSchema: ZodType<Input>;

    executor: (input: Input) => Promise<Result>;
}