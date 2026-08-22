import { writeFile } from "fs";
import {Shastra, ShastraBuilder} from "./app/agent.js"
import type { ITool } from "./app/agent.js"
import z from "zod";


const WeatherInputSchema = z.object({
    city: z.string(),
});

const WeatherResultSchema = z.object({
    city: z.string(),
    weatherDetails: z.string(),
});

const weatherTool: ITool<
    z.infer<typeof WeatherInputSchema>,
    z.infer<typeof WeatherResultSchema>
> = {
    name:'fetchWeatherInfo',
    description:'Fetches realtime weather data by cityname',
    doc:'fetchWeatherInfo(cityName: string): string',
    inputSchema:WeatherInputSchema,
    async executor({city}) {
        const response = await fetch(`https://wttr.in/${city.toLowerCase()}?format=%C+%t`);
        const weatherDetails = await response.text();
        return {
            city:city,
            weatherDetails
        };
    }
}

async function init(){
    const shastra: Shastra = Shastra.builder()
        .setIntructions("You are a helpful agent")
        .tool(weatherTool)
        .build()

    const result = await shastra.run('what is weather of delhi');
    // const parsedResult = await JSON.parse(result![result?.length! - 1]?.content as string);
    // const output = parsedResult.text
    console.log(result?.choices[0]?.message.content);
}

init();
