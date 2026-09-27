# QVAC integration notes

## Pinned package and inspected API

`@qvac/sdk` is a direct runtime dependency pinned to **0.20.0**. `package-lock.json` also pins its native/runtime dependencies (including `@qvac/inference` 0.20.0 and the resolved llama.cpp addon).

The integration was written after inspecting these installed files:

- `@qvac/sdk/package.json`: root ESM export and types, Node worker and optional command exports.
- `@qvac/sdk/dist/src/index.d.ts`: public `loadModel`, `completion`, `cancel`, `unloadModel`, `close`, model constants and result types.
- `@qvac/sdk/dist/src/client/api/load-model.js`: synchronous request ID on a decorated Promise.
- `@qvac/sdk/dist/src/client/api/completion-stream.d.ts` and implementation: canonical `events` and `final` surfaces.
- `@qvac/inference/dist/schemas/completion-stream.d.ts`: actual `generationParams` fields are `temp`, `predict`, `reasoning_budget`; this app does not invent `max_tokens` or `temperature` SDK fields.
- `@qvac/inference/dist/schemas/completion-event.d.ts`: `final.contentText`, terminal stop reasons and cancellation behavior.
- `@qvac/inference/dist/plugins/builtin/llamacpp-completion/ops/completion-stream.js`: `responseFormat.json_schema` is forwarded as a native grammar constraint. The schema includes explicit required properties and `additionalProperties: false`; `strict` alone does not add those constraints.
- `@qvac/llm-llamacpp/index.d.ts`: a positive per-request `reasoning_budget` limits the hidden reasoning channel. The app never displays it.
- `@qvac/inference/dist/models/registry/models.js`: selected catalog metadata and checksums.

The JS quickstart still demonstrates the older `tokenStream` surface. The installed declarations and text-generation documentation confirm `events` plus `final`, which NoteDrill uses.

## Adapter contract

`server/qvac.ts` owns all SDK interaction. No SDK import enters the React bundle.

- Load one **QWEN3_4B_INST_Q4_K_M** instance with an 8,192-token context, CPU device, zero GPU layers, one parallel slot and memory mapping.
- Reuse it across requests. Deduplicate model loads and reject overlapping quiz jobs.
- Generate one item per completion. Request structured JSON with a source quote, answer phrase, explanation and three distractors. Construct a fill-in-the-blank question by replacing the answer phrase in that exact quote. Assemble four options with a randomly positioned correct answer in application code. There are no predefined quiz answers.
- Run a second local completion to review the choices and explanation. This is an additional filter, not a correctness guarantee. Direct question writing was rejected after live tests showed answer/question mismatches that the model's reviewer also missed. Constructing the blank from the quote removes that specific mismatch.
- Validate the final public question schema, distinct choices, source ID, normalized exact quote and explanation occurrence, whole-word correct-answer occurrence in the quote, duplicate questions/evidence, and terminal output status. Explanations use extractive source text because live paraphrases sometimes introduced unsupported elaboration. Repair at most **two** invalid outputs across an entire quiz.
- Limit selected material to 4,000 UTF-8 bytes. Each item focuses on a distinct passage. Require prompt bytes plus the 768-token output allowance plus 512 tokens of framing headroom to fit the 8,192-token context. UTF-8 byte count is deliberately conservative for the byte-level tokenizer. Drafting disables thinking; the review allows 384 thinking tokens within its output budget.
- Observe both completion event errors and `final` rejection. Empty content and truncation fail validation. Five-minute generation timeout closes/reloads a stalled worker through the error path.
- Stop calls `cancel({ requestId })`. It repeats while the request enters the SDK registry to handle the documented early-cancel race. The UI remains in a stopping state until work settles. A 20-second cancellation watchdog closes a stuck worker.
- Shutdown uses `unloadModel({ modelId, clearStorage: false })` followed by `close()`.

Model metadata: **2,497,280,256 bytes**, SHA-256 `7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5`, catalog path `qvac_models_compiled/ggml/Qwen3-4B/2025-06-27/Qwen3-4B-Q4_K_M.gguf`.

## Outbound behavior

The only remote activity needed by the app is dependency installation and QVAC asset acquisition. Prompts go into the local Bare worker over local IPC. There are no remote completion calls, MCP tools, analytics, external fonts or external image embeds.

`seed: false` disables model seeding for loads. KV persistence is off (`kvCache: false`), and console logging is disabled in the generated SDK configuration. Empty `swarmRelays` does **not** disable QVAC’s registry networking; it just configures no extra relays. Catalog cache hits are checked against bundled size/checksum metadata before the registry client is created. This was inspected in `handlers/load-model/registry.js` and `registry-download-utils.js`. Registry downloads can open P2P connections and log download metadata. Do not equate source inspection with network-isolated verification.

## Official sources consulted

- [JavaScript/TypeScript setup](https://docs.qvac.tether.io/js-ts-sdk/)
- [Text generation](https://docs.qvac.tether.io/ai-capabilities/text-generation/)
- [API reference](https://docs.qvac.tether.io/reference/api/)
- [System requirements](https://docs.qvac.tether.io/system-requirements/)
- [Download lifecycle and offline loading](https://docs.qvac.tether.io/models/download-lifecycle/)
- [Cancellation](https://docs.qvac.tether.io/runtime/cancellation/)
- [Full documentation](https://docs.qvac.tether.io/llms-full.txt)
- [SDK source repository](https://github.com/tetherto/qvac)

This is original application code, not a fork of an example application.
