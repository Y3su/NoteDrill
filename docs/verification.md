# Verification record

Development host: Windows 11 Pro x64, approximately 14 GB usable RAM, AMD Radeon graphics. Bundled Node **24.19.0** was used because the system Node **22.15.1** is too old. Vulkan loader API reports **1.3.301**; QVAC’s published Windows requirement is **1.4+**. NoteDrill reports that discrepancy.

## Automated checks

- `npm run typecheck` and `npm run build` pass. **34 tests across four files pass.**
- Unit tests cover malformed/truncated output, exact quote and explanation matching, whole-word blanks, unknown source IDs, answer positions, duplicate options/questions, bounded repairs, semantic-review rejection, scoring, Unicode excerpt splitting, IndexedDB persistence/deletion, request origin/host validation, cancellation and worker recovery. SDK doubles are confined to `tests/unit/adapter.test.ts`.
- The initial unmocked QVAC load and completion succeeded. Llama 3.2 1B and Qwen3 1.7B generated weak or ambiguous answers; those candidates were rejected after reading the actual outputs.
- Final **QVAC 0.20.0 / QWEN3_4B_INST_Q4_K_M** unmocked smoke test passed: it correctly answered “transpiration” from the supplied note, then unloaded and closed the worker.
- Real three-question adapter generation and five-question production UI generation completed. Reading the outputs exposed weak distractors and occasional unsupported paraphrases. The final format asks for the original phrase in a source sentence, and explanations must match source text exactly.
- After those changes, `npm run test:production` passed with a fresh three-question quiz. Manual review confirmed the marked answers (cooling processes, local rainfall, comparing observations) restore the quoted sentences and every explanation is supported by the original lesson. This checks a sample, not every possible input.
- `npm run test:live -- --five` also passed on the final implementation. Its five answers were cooling processes, infiltration, local rainfall, varied mix and comparing observations. Each restored the source sentence and each explanation matched the notes. Distractors remain model-generated and can be weak; the quiz explicitly tests the original wording rather than accepting synonymous alternatives.
- Real **4B** generation was stopped through the UI. The service reached `cancelled`, `busy: false`, retained the model, and successfully generated a fresh five-question quiz afterward.

## Browser checks

The production interface was exercised against the real backend:

- Import UTF-8 Markdown, edit its title, save, reload and recover the notes.
- Reject empty, oversized (100,001-byte), and invalid UTF-8 files. Long notes show explicit section selection and the selected excerpt size.
- Prepare the cached model, generate five questions, stop and restart generation, answer all questions, and submit. One deliberate wrong answer produced **4/5**; answers and explanations were hidden before submission.
- Expand source evidence; reload and reopen the saved attempt. Retry contained only the missed question and scored **1/1**, with both attempts preserved across another reload.
- Inspect Markdown and JSON exports; copy both to the clipboard. The copied JSON parsed with five questions; Markdown included its answer key. Browser automation timed out capturing the file-download event, so the final on-disk browser download remains **unverified**. The preview and copy route work.
- Check desktop and narrow-screen layouts, keyboard radio selection, visible focus, and local-data confirmation. IndexedDB deletion itself is covered by unit tests; the retained sample library was not purged through the UI.
- Stop the real backend and verify the disconnected message, disabled generation and continued local note editing; restart successfully.

The saved five-question browser attempt predates the final extractive-explanation rule. The final production API output is recorded separately in `.local/production-quiz.json`.

## Offline test: blocked

Attempted `scripts/offline-windows.ps1`. The current process is **not an Administrator**, so the script stopped before changing firewall rules. No system network settings were changed.

Consequently, **network-isolated production startup and fresh quiz generation remain unverified**. A cached model and successful local inference do not prove this. Browser offline mode was not used as a substitute.

Reproduce from an elevated PowerShell after caching the final model and stopping the app:

```powershell
npm run build
powershell -NoProfile -File scripts/offline-windows.ps1
```

Use `-NodePath "C:\path\to\node.exe"` if the desired Node runtime is not first on PATH. The script fails unless both program-specific outbound block rules are present and an external Node request fails. IPv4 127/8 and IPv6 ::1 remain available. The fresh production quiz is written to `.local/production-quiz.json`. Rules are removed in `finally`; after a forced terminal termination, remove only rules with the `NoteDrill-offline-` prefix created by that run.

## Boundaries

- No Linux or macOS runtime tests were performed.
- Quote/schema checks do not prove educational correctness; the live sample output must be read and checked against its source.
- Test evidence is sample-only and excluded from source control under `.local/`.
- No publishing, social posting or bounty submission was performed.
