// Digital Asset Links : lie l'application Android (Google Play, Trusted Web Activity) a ce site.
// Renseigner ANDROID_ASSETLINKS_JSON (Vercel > Environment Variables) avec le JSON fourni par la Play Console / PWABuilder,
// par exemple : [{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app",
// "package_name":"com.labelleteranga.resto","sha256_cert_fingerprints":["AA:BB:..."]}}]
export async function GET() {
  let body = "[]";
  try {
    const raw = process.env.ANDROID_ASSETLINKS_JSON;
    if (raw) body = JSON.stringify(JSON.parse(raw));
  } catch {
    body = "[]";
  }
  return new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
}
