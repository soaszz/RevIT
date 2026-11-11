import "server-only";
import { saveCompatibleReviewerAttempt } from "../../../lib/server/reviewerAttemptCompatibility";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function POST(request: Request) {
  if (process.env.REVIT_REVIEWER_COMPATIBILITY_ENABLED!=="true") return Response.json({error:"Reviewer persistence disabled"},{status:503,headers});
  if (request.headers.get("origin")!==new URL(request.url).origin) return Response.json({error:"Origin required"},{status:403,headers});
  if (request.headers.get("content-type")?.split(";")[0].trim()!=="application/json") return Response.json({error:"Invalid input"},{status:400,headers});
  const owner=request.headers.get("x-revit-account");
  if (!owner) return Response.json({error:"Account required"},{status:400,headers});
  const reader=request.body?.getReader();if(!reader)return Response.json({error:"Invalid input"},{status:400,headers});
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
    if(size>8192){await reader.cancel();return Response.json({error:"Input too large"},{status:413,headers})}chunks.push(part.value)}
  let input:unknown;
  try { input=JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { return Response.json({error:"Invalid input"},{status:400,headers}); }
  try {
    const result=await saveCompatibleReviewerAttempt(input,owner);
    return Response.json(result,{headers});
  } catch(error) {
    const code=error instanceof Error ? ("code" in error && typeof error.code==="string"?error.code:error.message) : "PERSISTENCE_UNAVAILABLE";
    const status=code==="UNPUBLISHED"?404:code==="AUTH_REQUIRED"?401:code==="PRO_REQUIRED"?403:code==="ACCOUNT_CHANGED"?409:code.startsWith("INVALID_")?400:503;
    return Response.json({error:"Reviewer attempt could not be saved",code},{status,headers});
  }
}
