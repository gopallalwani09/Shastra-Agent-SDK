# 🧠 shastra-sdk

> **SDK for building AI agents with graph memory support**

[![npm version](https://img.shields.io/npm/v/shastra-sdk.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/shastra-sdk)
[![License: ISC](https://img.shields.io/badge/License-ISC-amber.svg?style=flat-square)](https://opensource.org/licenses/ISC)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

**Shastra** is a TypeScript SDK for building powerful multi-agent AI systems with persistent graph memory backed by Neo4j. Create agents, define tools, compose agent hierarchies, and let your AI remember everything — across sessions.

---

## ✨ Features

- 🤖 **Multi-Agent Orchestration** — Create and chain agents with automatic handoffs
- 🧩 **Typed Tool System** — Define type-safe tools with Zod schema validation
- 🧠 **Graph Memory** — Persistent user memory backed by Neo4j knowledge graphs
- 🔄 **Background Memory Sync** — Automatic background graph updates after every conversation turn
- 🛡️ **Built-in Guardrails** — LLM-powered input/output safety checks
- 📐 **Structured Outputs** — Force agents to respond in a validated JSON schema
- 🔌 **OpenAI-Compatible** — Works with any OpenAI-compatible API (OpenRouter, etc.)

---

## 📦 Installation

```bash
npm install shastra-sdk
```

---

## 🚀 Quick Start

### 1. Set Up Environment Variables

Create a `.env` file in your project root:

```env
API_KEY=your_openai_api_key
BASE_URL=https://openrouter.ai/api/v1   # or https://api.openai.com/v1
NEO4J_URI=bolt://localhost:7687          # Optional: for graph memory
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password
```

### 2. Create Your First Agent

```typescript
import { Shastra, Runner } from 'shastra-sdk';

const agent = new Shastra({
  name: 'assistant',
  description: 'A helpful AI assistant',
  instructions: 'You are a helpful assistant. Answer questions clearly and concisely.'
});

const runner = new Runner();
const result = await runner.run(agent, 'Hello! What can you do?');
console.log(result);
```

### 3. Add Tools

```typescript
import { Shastra, Runner } from 'shastra-sdk';
import type { ITool } from 'shastra-sdk';
import { z } from 'zod';

const weatherTool: ITool<{ city: string }, string> = {
  name: 'get_weather',
  description: 'Get the current weather for a city',
  inputSchema: z.object({ city: z.string() }),
  executor: async ({ city }) => {
    // Your implementation here
    return `It's sunny and 25°C in ${city}`;
  }
};

const agent = new Shastra({
  name: 'weather_bot',
  description: 'An assistant that can check weather',
  instructions: 'You are a weather assistant. Use the get_weather tool to answer weather questions.',
  tools: [weatherTool]
});

const runner = new Runner();
const result = await runner.run(agent, 'What is the weather in Mumbai?');
```

---

## 🏗️ API Reference

### `Shastra` — The Agent Class

The core agent class. Accepts a `ShastraConfig` object.

```typescript
import { Shastra } from 'shastra-sdk';
import type { ShastraConfig } from 'shastra-sdk';

const config: ShastraConfig = {
  name: 'my_agent',           // Required: unique agent name
  description: 'My agent',    // Required: what this agent does
  instructions: '...',        // Required: system prompt
  tools: [],                  // Optional: ITool array
  agents: [],                 // Optional: sub-agents for handoff
  outputSchema: undefined     // Optional: Zod schema for structured output
};

const agent = new Shastra(config);
```

---

### `ShastraBuilder` — Fluent Builder API

Build agents with a fluent, chainable API:

```typescript
import { ShastraBuilder } from 'shastra-sdk';

const agent = new ShastraBuilder()
  .name('my_agent')
  .description('A capable AI assistant')
  .instructions('You are a helpful assistant.')
  .tool(myTool)
  .agent(subAgent)
  .outputSchema(z.object({ answer: z.string() }))
  .build();
```

---

### `Runner` — Agent Execution Engine

```typescript
import { Runner, globalContext, resetGlobalContext } from 'shastra-sdk';

const runner = new Runner();

// Run an agent with a query
const result = await runner.run(agent, 'What is 2 + 2?');

// Access the conversation context
const ctx = runner.getContext();

// Reset conversation history
runner.resetContext();
// or
resetGlobalContext();
```

**Limits:**
- `MAX_LOOP = 30` iterations per run (prevents infinite tool loops)
- `MAX_DEPTH = 10` agent handoff depth

---

### `ITool<Input, Result>` — Tool Interface

```typescript
import type { ITool } from 'shastra-sdk';
import { z } from 'zod';

const myTool: ITool<{ query: string }, { result: string }> = {
  name: 'search',
  description: 'Search the internet for information',
  doc: 'Optional documentation string',
  inputSchema: z.object({ query: z.string() }),
  executor: async ({ query }) => {
    const result = await fetchFromInternet(query);
    return { result };
  }
};
```

---

### Multi-Agent Handoffs

Compose agents together. When a parent agent has sub-agents, it can automatically hand off tasks:

```typescript
import { Shastra, Runner } from 'shastra-sdk';

const codeAgent = new Shastra({
  name: 'code_writer',
  description: 'Specializes in writing code',
  instructions: 'You are an expert programmer. Write clean, well-commented code.'
});

const reviewAgent = new Shastra({
  name: 'code_reviewer',
  description: 'Specializes in reviewing code',
  instructions: 'You are a code reviewer. Provide detailed feedback on code quality.'
});

const orchestrator = new Shastra({
  name: 'orchestrator',
  description: 'Coordinates code writing and review tasks',
  instructions: 'Use code_writer for code generation and code_reviewer for reviewing.',
  agents: [codeAgent, reviewAgent]
});

const runner = new Runner();
await runner.run(orchestrator, 'Write a binary search function and review it.');
```

---

### Structured Outputs

Force your agent to return validated JSON using a Zod schema:

```typescript
import { Shastra, Runner } from 'shastra-sdk';
import { z } from 'zod';

const outputSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  score: z.number().min(0).max(1),
  reasoning: z.string()
});

const sentimentAgent = new Shastra({
  name: 'sentiment_analyzer',
  description: 'Analyzes sentiment of text',
  instructions: 'Analyze the sentiment of user text.',
  outputSchema
});

const runner = new Runner();
const raw = await runner.run(sentimentAgent, 'I love this SDK!');
const parsed = JSON.parse(raw!);
// { sentiment: 'positive', score: 0.97, reasoning: '...' }
```

---

## 🧠 Graph Memory

Shastra's killer feature — persistent memory backed by Neo4j.

### Setup Neo4j

```typescript
import { initNeo4j, verifyConnection, ensureGraphConstraints } from 'shastra-sdk';

// Initialize with credentials
initNeo4j({
  uri: 'bolt://localhost:7687',
  username: 'neo4j',
  password: 'password'
});

// Verify connection
const connected = await verifyConnection();
console.log('Connected:', connected);

// Create graph schema constraints
await ensureGraphConstraints();
```

### Start Background Memory Sync

The graph updater runs in the background, automatically capturing memories from conversations:

```typescript
import { startGraphMemory, stopGraphMemory } from 'shastra-sdk';

// Start the background memory updater
startGraphMemory({
  credentials: {
    uri: 'bolt://localhost:7687',
    username: 'neo4j',
    password: 'password'
  },
  userId: 'user_123',
  intervalMs: 120_000,  // 2 minutes (default)
  runImmediately: false,
  verifyOnStart: true
});

// ... your app runs ...

// Stop and close connection on exit
await stopGraphMemory(true);
```

### Manual Memory Extraction

```typescript
import { makeMemory } from 'shastra-sdk';

// Extract memories from current conversation (uses globalContext automatically)
const result = await makeMemory(undefined, 'user_123');

// Or from a custom string context
const result = await makeMemory('I love building with TypeScript and Next.js.', 'user_123');

console.log(result.extracted.entities);
// [{ name: 'TypeScript', type: 'Technology', ... }, ...]
console.log(result.extracted.queries);
// ["MERGE (u:User {id: 'user_123'}) ...", ...]
```

### Context Retrieval

Automatically fetch relevant graph context before answering queries:

```typescript
import { makeQueryContext, isUsingGraphDb, setGraphDbEnabled } from 'shastra-sdk';

// Check if graph db is active
console.log(isUsingGraphDb()); // true if Neo4j initialized

// Manually enable/disable
setGraphDbEnabled(true);

// Get relevant context for a query
const context = await makeQueryContext("What programming languages do I know?", 'user_123');
console.log(context);
// "- WORKS_WITH: TypeScript [Type: Language]\n- WORKS_WITH: Python [Type: Language]"
```

---

### Knowledge Graph Schema

Shastra stores memories as a typed property graph:

| Node Type | Properties | Description |
|-----------|-----------|-------------|
| `User` | `id` | The user identity node |
| `Preference` | `name`, `category`, `type` | Likes & dislikes |
| `Technology` | `name`, `type` | Tools, languages, frameworks |
| `Project` | `name`, `description` | Projects worked on |
| `Topic` | `name` | Areas of interest |
| `Person` | `name` | People the user knows |

| Relationship | From → To | Meaning |
|-------------|-----------|---------|
| `LIKES` | User → Preference | User likes this |
| `DISLIKES` | User → Preference | User dislikes this |
| `WORKS_ON` | User → Project | User is working on |
| `WORKS_WITH` | User → Technology | User uses this tech |
| `INTERESTED_IN` | User → Topic | User is interested in |
| `KNOWS` | User → Person | User knows this person |
| `USES` | Project → Technology | Project uses this tech |

---

## 🛡️ Guardrails

Shastra includes automatic LLM-powered safety checks on every input and output.

**Input Guardrail** blocks:
- Sexual, hacking-related or unethical content
- Personal identifying information (phone numbers, IDs)
- Malicious system operations (fork bombs, file deletion commands)

**Output Guardrail** blocks:
- Leaked API keys, database URLs, or passwords
- Political statements or offensive language

Guardrail violations throw a `GuardrailError`:

```typescript
import { GuardrailError } from 'shastra-sdk'; // Note: exported from guardrails

try {
  await runner.run(agent, userInput);
} catch (error) {
  if (error instanceof GuardrailError) {
    console.log('Blocked:', error.message);
    console.log('Reason:', error.reason);
  }
}
```

---

## ⚙️ Query Executor

Directly execute Cypher queries on your Neo4j database:

```typescript
import { executeQuery, executeQueries } from 'shastra-sdk';

// Single query
const result = await executeQuery(
  'MATCH (u:User {id: $userId})-[r]->(n) RETURN type(r), n.name LIMIT 10',
  { userId: 'user_123' }
);
console.log(result.records);
console.log(result.summary); // { nodesCreated, relationshipsCreated, ... }

// Multiple queries
const results = await executeQueries([
  "MERGE (t:Technology {name: 'TypeScript'})",
  "MERGE (t:Technology {name: 'Node.js'})"
]);
```

---

## 🔧 Advanced Configuration

### Neo4j Connection Management

```typescript
import {
  initNeo4j,
  getDriver,
  isNeo4jInitialized,
  verifyConnection,
  closeDriver
} from 'shastra-sdk';

// Initialize
initNeo4j({ uri, username, password });

// Get driver instance
const driver = getDriver();

// Check if initialized
console.log(isNeo4jInitialized()); // true

// Close on shutdown
await closeDriver();
```

### Graph Updater State Management

```typescript
import {
  checkContextUpdated,
  setNeedsUpdate,
  getNeedsUpdateStatus,
  getUpdatedContext,
  processGraphUpdate,
  isGraphUpdaterRunning,
  resetGraphUpdaterState,
  getActiveUserId,
  setActiveUserId,
  DEFAULT_UPDATE_INTERVAL_MS
} from 'shastra-sdk';

// Check if new messages need to be synced
const hasUpdates = checkContextUpdated();

// Manually trigger a graph update
const result = await processGraphUpdate('user_123');

// Get only new messages since last sync
const newMessages = getUpdatedContext();

// Reset all state (useful for testing)
resetGraphUpdaterState();
```

---

## 📋 Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | ✅ Yes | — | OpenAI (or compatible) API key |
| `BASE_URL` | No | OpenAI default | Base URL for the API |
| `NEO4J_URI` | No | `bolt://localhost:7687` | Neo4j Bolt connection URI |
| `NEO4J_USERNAME` | No | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | No | `` | Neo4j password |

---

## 📁 Package Exports

```typescript
// Core Agent
import { Shastra, ShastraBuilder, Runner, globalContext, resetGlobalContext } from 'shastra-sdk';

// Types
import type { ShastraConfig, ITool, RunContext } from 'shastra-sdk';

// Neo4j Connection
import { initNeo4j, getDriver, verifyConnection, closeDriver, ensureGraphConstraints, isNeo4jInitialized, driver } from 'shastra-sdk';
import type { Neo4jCredentials } from 'shastra-sdk';

// Query Execution
import { executeQuery, executeQueries, queryExecutorTool, QueryExecutorInputSchema } from 'shastra-sdk';
import type { QueryExecutionResult, QueryExecutorInput } from 'shastra-sdk';

// Memory
import { makeMemory, checkNodeExists, validateDuplicatePreventionGuardrail, MemoryExtractionSchema } from 'shastra-sdk';
import type { MemoryExtraction, MemoryMakerResult } from 'shastra-sdk';

// Graph Updater
import { startGraphUpdater, stopGraphUpdater, startGraphMemory, stopGraphMemory, checkContextUpdated, setNeedsUpdate, getNeedsUpdateStatus, getUpdatedContext, processGraphUpdate, isGraphUpdaterRunning, resetGraphUpdaterState, getActiveUserId, setActiveUserId, DEFAULT_UPDATE_INTERVAL_MS } from 'shastra-sdk';
import type { GraphUpdaterOptions } from 'shastra-sdk';

// Context Retrieval
import { makeQueryContext, getQueryContext, isUsingGraphDb, setGraphDbEnabled, ContextRetrievalSchema } from 'shastra-sdk';
import type { ContextRetrieval } from 'shastra-sdk';
```

---

## 📄 License

ISC © [Gopal Lalwani](https://github.com/gopallalwani09)
