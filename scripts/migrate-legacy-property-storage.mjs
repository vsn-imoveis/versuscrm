/**
 * Migra imagens do antigo Storage VSN para o Storage único do VersusCRM.
 *
 * Execução:
 *   SUPABASE_URL=https://<project>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<server-only-secret> \
 *   node scripts/migrate-legacy-property-storage.mjs
 *
 * O modo padrão é DRY RUN. Para gravar:
 *   ... node scripts/migrate-legacy-property-storage.mjs --apply
 *
 * A migração só altera URLs que apontam para o projeto Supabase legado.
 * URLs de fornecedores externos (Foxter/QuintoAndar) são preservadas.
 */
const LEGACY_HOST = "jpdfynaioepcmgqlqlht.supabase.co";
const DESTINATION_BUCKET = "crm-property-photos";
const PAGE_SIZE = 100;
const APPLY = process.argv.includes("--apply");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (somente no ambiente local/servidor).");
}
if (SUPABASE_URL.includes(LEGACY_HOST)) {
  throw new Error("SUPABASE_URL deve apontar para o projeto do VersusCRM, não para o projeto legado.");
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

function isLegacyStorageUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname === LEGACY_HOST &&
      url.pathname.startsWith("/storage/v1/object/public/property-photos/");
  } catch {
    return false;
  }
}

function destinationFor(sourceUrl, propertyId) {
  const parsed = new URL(sourceUrl);
  const marker = "/storage/v1/object/public/property-photos/";
  const suffix = decodeURIComponent(parsed.pathname.slice(marker.length))
    .split("/")
    .filter(Boolean)
    .join("/");
  if (!suffix || suffix.includes("..")) {
    throw new Error(`Caminho de imagem inválido para o imóvel ${propertyId}`);
  }
  return `properties/${propertyId}/${suffix.replace(/^properties\/[0-9a-f-]+\//i, "")}`;
}

function publicUrl(objectPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${DESTINATION_BUCKET}/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

async function downloadAndUpload(sourceUrl, objectPath) {
  const source = await fetch(sourceUrl);
  if (!source.ok) throw new Error(`Download ${source.status}: ${sourceUrl}`);
  const contentType = source.headers.get("content-type") || "application/octet-stream";
  const bytes = await source.arrayBuffer();
  if (!bytes.byteLength) throw new Error(`Arquivo vazio: ${sourceUrl}`);

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${DESTINATION_BUCKET}/${objectPath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "x-upsert": "true",
    },
    body: bytes,
  });
  if (!uploaded.ok) {
    throw new Error(`Upload ${uploaded.status}: ${await uploaded.text()}`);
  }
  return publicUrl(objectPath);
}

async function updateProperty(propertyId, photos, thumbnails) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ photos, photo_thumbnails: thumbnails }),
    },
  );
  if (!response.ok) {
    throw new Error(`Atualização do imóvel ${propertyId} falhou: ${response.status} ${await response.text()}`);
  }
}

let offset = 0;
let scanned = 0;
let migratedProperties = 0;
let migratedFiles = 0;
let failedProperties = 0;

while (true) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/properties`);
  url.searchParams.set("select", "id,company_id,photos,photo_thumbnails");
  url.searchParams.set("order", "id.asc");
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Leitura de properties falhou: ${response.status} ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) break;

  for (const property of rows) {
    scanned += 1;
    const photos = Array.isArray(property.photos) ? property.photos : [];
    const thumbnails = Array.isArray(property.photo_thumbnails) ? property.photo_thumbnails : [];
    const legacyUrls = [...photos, ...thumbnails].filter(isLegacyStorageUrl);
    if (!legacyUrls.length) continue;

    if (!APPLY) {
      console.log(`[DRY RUN] ${property.id}: ${legacyUrls.length} arquivo(s) antigos`);
      continue;
    }

    try {
      const migrated = new Map();
      for (const sourceUrl of legacyUrls) {
        if (migrated.has(sourceUrl)) continue;
        const objectPath = destinationFor(sourceUrl, property.id);
        migrated.set(sourceUrl, await downloadAndUpload(sourceUrl, objectPath));
        migratedFiles += 1;
      }
      const nextPhotos = photos.map(url => migrated.get(url) || url);
      const nextThumbnails = thumbnails.map(url => migrated.get(url) || url);
      await updateProperty(property.id, nextPhotos, nextThumbnails);
      migratedProperties += 1;
      console.log(`[OK] ${property.id}: ${migrated.size} arquivo(s) migrado(s)`);
    } catch (error) {
      failedProperties += 1;
      console.error(`[ERRO] ${property.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  offset += rows.length;
  if (rows.length < PAGE_SIZE) break;
}

console.log(JSON.stringify({
  mode: APPLY ? "APPLY" : "DRY_RUN",
  scannedProperties: scanned,
  migratedProperties,
  migratedFiles,
  failedProperties,
}, null, 2));

if (!APPLY && scanned > 0) {
  console.log("Nenhum dado foi alterado. Revise a lista e execute novamente com --apply para migrar.");
}
