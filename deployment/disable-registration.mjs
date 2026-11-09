import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";

const webRoot = "/app/web/.next";
const loginDir = path.join(webRoot, "static/chunks/app/(auth)/login");
const chunks = fs.readdirSync(loginDir).filter(name => /^page-[a-f0-9]+\.js$/.test(name));
if (chunks.length !== 1) throw new Error("Expected exactly one login page chunk");

// Remove the entire registration paragraph from both React render paths.
const paragraph = /\(0,[\w$]+\.jsxs\)\("p",\{className:"mt-6 text-center text-sm text-\[var\(--muted-foreground\)\]",children:\[[\w$]+\("Don't have an account\?"\)," ",\(0,[\w$]+\.jsx\)\([^,]+,\{href:"\/register",className:"text-\[var\(--primary\)\] hover:underline font-medium",children:[\w$]+\("Create one"\)\}\)\]\}\)/g;

const clientPath = path.join(loginDir, chunks[0]);
const serverPath = path.join(webRoot, "server/app/(auth)/login/page.js");
for (const file of [clientPath, serverPath]) {
  const source = fs.readFileSync(file, "utf8");
  const matches = source.match(paragraph) ?? [];
  if (matches.length !== 1) throw new Error(`Unexpected registration markup in ${file}`);
  const patched = source.replace(paragraph, "null");
  new vm.Script(patched, { filename: file });
  fs.writeFileSync(file, patched);
}

// Issue a new content URL so existing browsers cannot reuse the old chunk.
const oldName = chunks[0];
const digest = crypto.createHash("sha256").update(fs.readFileSync(clientPath)).digest("hex").slice(0, 16);
const newName = `page-${digest}.js`;
fs.renameSync(clientPath, path.join(loginDir, newName));

function* files(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (entry.isFile()) yield file;
  }
}

let references = 0;
for (const file of files(webRoot)) {
  if (!/\.(js|json|html|rsc)$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(oldName)) continue;
  references += source.split(oldName).length - 1;
  fs.writeFileSync(file, source.replaceAll(oldName, newName));
}
if (!references) throw new Error("No login chunk references were updated");

// This public deployment is already provisioned. Account creation remains
// available through the authenticated administrator endpoints only.
const authPath = "/app/deeptutor/api/routers/auth.py";
const authSource = fs.readFileSync(authPath, "utf8");
const startMarker = '@router.post("/register", status_code=status.HTTP_201_CREATED)';
const endMarker = '@router.get("/is_first_user")';
const start = authSource.indexOf(startMarker);
const end = authSource.indexOf(endMarker, start);
if (start < 0 || end <= start || authSource.indexOf(startMarker, start + 1) !== -1) {
  throw new Error("Unexpected registration API structure");
}
const replacement = `${startMarker}
async def register(body: RegisterRequest, request: Request, response: Response) -> dict:
    """Public self-registration is disabled for this deployment."""
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Self-registration is disabled. Contact the administrator.",
    )


`;
fs.writeFileSync(authPath, authSource.slice(0, start) + replacement + authSource.slice(end));
console.log(JSON.stringify({ registration: "disabled", clientChunk: newName, references }));
