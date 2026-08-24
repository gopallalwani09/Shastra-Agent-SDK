import {
    ShastraBuilder,
    Runner
} from "../index.js";
import * as z from "zod";
import "dotenv/config"

const AdministrationExplanationSchema = z.object({
    definition: z.string().describe("A concise definition of administration"),
    keyFunctions: z.array(z.string()).describe("Core functions of administration like planning, organizing, leading, etc."),
    importance: z.string().describe("Why administration is important in organizations"),
    examples: z.array(z.string()).describe("Real-world examples of administration in practice")
});

const adminAgent = new ShastraBuilder()
    .name("admin_agent")
    .description("An expert agent in organizational administration")
    .instructions(`
        You are an organizational administration expert.
        Provide clear, comprehensive explanations of administration concepts.
    `)
    .outputSchema(AdministrationExplanationSchema)
    .build();

const runner = new Runner();

const response = await runner.run(
    adminAgent,
    "What is administration?"
);

console.log("Raw Response Content:\n", response.choices[0]?.message.content);

if (response.choices[0]?.message.content) {
    const parsed = JSON.parse(response.choices[0].message.content);
    console.log("\nParsed JSON Output:\n", JSON.stringify(parsed, null, 2));
}
