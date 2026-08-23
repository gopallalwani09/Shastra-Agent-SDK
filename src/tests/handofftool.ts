import {
    Shastra,
    ShastraBuilder,
    Runner
} from "../index.js";
import * as z from "zod";
import type { ZodType } from "zod";
import type { ITool } from "../types/Tool.js";

const mathAgent = new ShastraBuilder()
    .name("math_agent")
    .description(
        "Handles mathematics, algebra, geometry and calculations"
    )
    .instructions(`
        You are a mathematics specialist.

        Solve mathematical problems accurately.
        Explain your reasoning clearly.
    `)
    .build();

const WeatherResultSchema = z.object({
    city: z.string(),
    weatherDetails: z.string(),
});

const WeatherInputSchema = z.object({
    city: z.string(),
});

const weatherTool: ITool<
    z.infer<typeof WeatherInputSchema>,
    z.infer<typeof WeatherResultSchema>
> = {
    name: 'fetchWeatherInfo',
    description: 'Fetches realtime weather data by cityname',
    doc: 'fetchWeatherInfo(cityName: string): string',
    inputSchema: WeatherInputSchema,
    async executor({ city }) {
        const response = await fetch(`https://wttr.in/${city.toLowerCase()}?format=%C+%t`);
        const weatherDetails = await response.text();
        return {
            city: city,
            weatherDetails
        };
    }
}

const weatherAgent = new ShastraBuilder()
    .name("weather_agent")
    .description(
        "Handles weather-related questions"
    )
    .instructions(`
        You are a weather specialist.

        Use available weather tools to answer
        weather-related questions.
    `)
    .tool(weatherTool)
    .build();

const mainAgent = new ShastraBuilder()
    .name("main_agent")
    .description(
        "A general purpose assistant"
    )
    .instructions(`
        You are a helpful general-purpose assistant.

        Use specialist agents whenever they are
        better suited for the user's request.
    `)
    .agent(mathAgent)
    .agent(weatherAgent)
    .build();

const runner = new Runner();

const response = await runner.run(
    mainAgent,
    "What are Euclid's axioms and what is the weather in Delhi?"
);

console.log(
    response.choices[0]?.message.content
);
