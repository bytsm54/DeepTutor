import fs from 'node:fs';

const path = process.argv[2] || '/app/deeptutor/api/routers/settings.py';
const original = `async def get_llm_options():
    if not get_current_user().is_admin:
        return allowed_llm_options()
    return list_llm_options(get_model_catalog_service().load())`;
const replacement = `async def get_llm_options():
    # Keep other profiles in the catalog, but show the designated API model in
    # the model picker. Respect each user's existing model grants.
    payload = (list_llm_options(get_model_catalog_service().load())
               if get_current_user().is_admin else allowed_llm_options())
    allowed = [item for item in payload.get("options", [])
               if item.get("provider") == "openai"
               and item.get("model") == "gpt-6.1-sol"
               and item.get("model_id") == "llm-model-openai-api-gpt-6.1-sol"]
    active = payload.get("active")
    if not any(item.get("profile_id") == (active or {}).get("profile_id")
               and item.get("model_id") == (active or {}).get("model_id")
               for item in allowed):
        active = None
    return {"active": active, "options": allowed}`;
const source = fs.readFileSync(path, 'utf8');
if (source.includes(replacement)) {
  console.log('Model picker patch already present.');
} else {
  if (source.split(original).length !== 2) {
    throw new Error('Expected model picker endpoint not found exactly once; refusing to patch.');
  }
  fs.writeFileSync(path, source.replace(original, replacement));
  console.log('Patched model picker endpoint.');
}
