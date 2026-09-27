# NoteDrill

A local study workspace: your notes → a short quiz → explanations with source excerpts → saved practice.

React, TypeScript and Vite provide the interface. A small Express service runs **`@qvac/sdk` 0.20.0** in Node, outside the browser bundle. There is no cloud inference, API key or cloud fallback.

## Prerequisites

- **Node.js 22.17+**; Node **24 LTS** is recommended. npm 10.9+.
- Windows 10/11 x64, macOS 14+, or Ubuntu 22+ / a compatible Linux desktop. Development and verification took place on **Windows 11 x64, Node 24.19.0**.
- QVAC documents **Vulkan 1.4+ on Windows, even for CPU inference**. Install the current AMD/Intel/NVIDIA driver. `npm run doctor` queries the actual Vulkan loader. An absent loader blocks preparation; an older loader produces an explicit warning. CPU inference worked on this development machine’s 1.3.301 loader, but that does **not** establish support below QVAC’s published requirement.
- For this model, aim for **16 GB total RAM, 4 GB available**, and several GB of free disk space. Performance depends on your CPU and available memory.
- Linux: install `libatomic1`; GPU use needs Vulkan drivers. NoteDrill deliberately uses CPU mode. macOS uses the SDK’s native runtime. Linux/macOS were not tested here.

## Install and run

Windows PowerShell, from this directory:

```powershell
node --version
npm ci
npm run doctor
npm run build
npm start
```

Linux/macOS, from this directory:

```sh
node --version
npm ci
npm run doctor
npm run build
npm start
```

Open **http://127.0.0.1:4317**. Keep the terminal running. Stop with Ctrl+C. Use **Try a sample**, or import `sample-notes/urban-trees.md`, then **Prepare local model**.

The initial model download needs internet. Selected model: **`QWEN3_4B_INST_Q4_K_M`**, a Qwen3 4B model quantized to Q4_K_M; **2,497,280,256 bytes** according to the pinned SDK catalog. The 1B Llama and 1.7B Qwen candidates were evaluated and rejected for poor quiz quality.

For development:

```sh
npm run dev
```

Open **http://127.0.0.1:5173**. Vite proxies `/api` to the service. Both bind to `127.0.0.1`. Development and production addresses have separate browser libraries.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Check browser, server and test TypeScript |
| `npm test` | Unit tests; SDK doubles are explicitly labeled |
| `npm run build` | Compile the server and build local browser assets |
| `npm start` | Run the production app |
| `npm run doctor` | Node, platform, available memory and Windows Vulkan diagnostics |
| `npm run test:smoke` | Unmocked QVAC model load and short completion |
| `npm run test:live` | Unmocked three-question generation from original sample notes |
| `npm run test:live -- --five` | Unmocked five-question generation |
| `npm run test:cancel` | Unmocked SDK cancellation and model recovery |
| `npm run test:production` | Generate a fresh quiz through a running production service |

Run live tests one at a time, with the app’s model released, to avoid competing for memory. Live tests write **sample-only** evidence to ignored `.local/` files. The app itself does not log notes or prompts.

## Study workflow

- Paste text or import UTF-8 `.txt` / `.md` files, up to 100 KB each. Rename and edit notes; changes save locally.
- Choose 3 or 5 questions. For notes over 4,000 UTF-8 bytes, explicitly select sections. Only selected material is eligible for the quiz; each question focuses on a different passage.
- Questions use a focused fill-in-the-blank format: choose the phrase used in the original notes. The local model selects a factual quote, answer phrase and supporting explanation, then generates three distractors. Explanations must match source text exactly to prevent unsupported elaboration. The app creates the blank from the quote and checks the evidence; a second local completion reviews the item.
- Stop cancels the actual SDK request. Native loading may finish before stopping; a stuck worker is closed after 20 seconds.
- Answer all questions and submit to reveal deterministic scores, explanations and expandable source quotes.
- Reopen saved attempts, retry missed questions, or export quizzes with their answer keys as Markdown or JSON. Exports include a preview, a download link and a copy option.
- Local data & settings offers a library export and confirmed deletion. Notes are rendered as plain text, including Markdown, so embedded HTML and remote images never execute or load.

## Storage and privacy

- Notes, quizzes, attempts and preferences live in **IndexedDB in this browser**, for this origin. Browser data deletion or private browsing can remove them. Export important material.
- The Node service holds only the current job in memory. It accepts JSON source text, never arbitrary file paths. It checks the Host and Origin headers and requires a custom header for mutations; there is no permissive CORS.
- Cached weights: Windows `%LOCALAPPDATA%\NoteDrill\models`; Linux/macOS `$XDG_CACHE_HOME/notedrill/models`, otherwise `~/.cache/notedrill/models`. Configuration lives beside the cache. Nothing is stored in the source tree.
- Stopping or releasing the model preserves cached weights. Delete all local data clears the browser library and service session, while retaining model weights. Stop the app before manually deleting its dedicated model cache.
- Keep `node_modules` beside `dist` for production. Server dependencies are **not bundled**; QVAC resolves Bare, worker files and native addons from their installed package locations. Do not copy only the browser build to another machine.

## Offline verification

Cached catalog loading is implemented; scripts, styles, fonts and icons are local. **Network-isolated offline operation has not yet been verified on this machine** because the current terminal cannot create Windows Firewall rules.

After preparing the model, stop NoteDrill. From an **Administrator PowerShell** in this directory:

```powershell
powershell -NoProfile -File scripts/offline-windows.ps1
```

The script temporarily blocks external traffic for the exact Node and Bare executables, preserves loopback, starts the production server again, generates a new quiz, and removes its rules in `finally`. It does not change global firewall policy. A browser offline toggle is insufficient. See [verification notes](docs/verification.md).

## Troubleshooting

- **Old Node:** install Node 24 LTS and reopen PowerShell. Some npm shims use a different Node than `node --version`; check `where.exe node` and `Get-Command npm`.
- **Missing Vulkan / native worker crash:** update the GPU vendor driver, restart Windows, run `npm run doctor`. On Linux check `libatomic1`. Close other apps if memory is low.
- **Download interrupted:** retry preparation with internet connected. QVAC retains partial downloads. Check disk space. A checksum failure requires removing the dedicated model cache while the app is stopped, then downloading again.
- **Worker startup timed out:** retry explicitly. Cold disks and antivirus scanning can delay native startup; NoteDrill allows 90 seconds.
- **Invalid quiz / insufficient material:** select another passage or add clear factual notes and retry. There are at most two local regeneration attempts per quiz; failures remain failures.
- **Service disconnected:** run `npm start`, then Reconnect. Existing notes and attempts remain usable.

Evidence matching and schemas catch structural errors; they cannot guarantee educational correctness. Review explanations against the quoted notes.

See [QVAC integration details](docs/qvac-integration.md) for the verified API and source references. Publishing and bounty submission are outside this implementation.
