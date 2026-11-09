import fs from 'node:fs';

// GPT-6 reasoning models reject temperature when their default effort is used.
// Patch the shared predicate so both Responses and Chat Completions omit it.
const file = '/app/deeptutor/services/llm/provider_core/openai_compat_provider.py';
const before = 'return not any(token in name for token in ("gpt-5", "o1", "o3", "o4"))';
const after = 'return not any(token in name for token in ("gpt-5", "gpt-6", "o1", "o3", "o4"))';
const source = fs.readFileSync(file, 'utf8');
// v1.7.2 handles the GPT-6 family upstream. Keep that implementation and let
// verify-openai-defaults.py exercise both protocols and stream modes.
if (source.includes('family == "gpt-6" or family.startswith(("gpt-6-", "gpt-6."))')) {
  console.log('Upstream GPT-6 temperature handling detected; no local rewrite required');
  process.exit(0);
}
if (source.split(before).length !== 2) {
  throw Error('Unexpected DeepTutor temperature compatibility code; review the pinned release');
}
fs.writeFileSync(file, source.replace(before, after));
console.log('GPT-6 API requests omit temperature, including with default reasoning effort');
