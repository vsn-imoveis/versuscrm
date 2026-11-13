/**
 * Migração em duas fases das imagens antigas para o Storage único do VersusCRM.
 *
 * DRY RUN (somente leitura):
 *   node scripts/migrate-legacy-property-storage.mjs
 *
 * Fase 1 - copiar arquivos, sem alterar public.properties:
 *   node scripts/migrate-legacy-property-storage.mjs --upload-only
 *
 * Fase 2 - validar destino e atualizar URLs no banco compartilhado:
 *   node scripts/migrate-legacy-property-storage.mjs --apply
 *
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do projeto VersusCRM.
 * Nunca configure as credenciais do projeto legado neste script.
 */
const LEGACY_HOST = "jpdfynaioepcmgqlqlht.supabase.co";
const DESTINATION_BUCKET = "crm-property-photos";
const PAGE_SIZE = 100;
const APPLY = process.argv.includes("--apply");
const UPLOAD_ONLY = process.argv.includes("--upload-only");

if (APPLY && UPLOAD_ONLY) {
  throw new Error("Use apenas um modo: --upload-only ou --apply.");
}

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  throw new Error("Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (somente no ambiente local/servidor).");
}
const destinationHost = new URL(SUPABASE_URL).hostname;
if (destinationHost === LEGACY_HOST || !destinationHost.endsWith(".supabase.co")) {
  throw new Error("SUPABASE_URL deve apontar para o projeto Supabase do VersusCRM.");
}
if (!destinationHost.startsWith("xmwkakimyifmspzoziji.")) {
  throw new Error(`Projeto de destino inesperado (${destinationHost}). Esperado: xmwkakimyifmspzoziji.supabase.co`);
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
  if (!suffix || suffix.split("/").includes("..")) {
    throw new Error(`Caminho de imagem inválido para o imóvel ${propertyId}`);
  }
  const relative = suffix.replace(new RegExp(`^(?:properties/)?${String(propertyId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "i"), "");
  const safeRelative = relative || suffix.split("/").pop();
  return `properties/${propertyId}/${safeRelative}`;
}

function objectUrl(objectPath, isPublic = false) {
  const endpoint = isPublic ? "object/public" : "object";
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return `${SUPABASE_URL}/storage/v1/${endpoint}/${DESTINATION_BUCKET}/${encodedPath}`;
}

async function destinationExists(objectPath) {
  // Storage list endpoint is authenticated and supports exact object checks.
  // HEAD against the public URL can return 400 for missing objects and is not
  // a reliable existence check across Supabase Storage deployments.
  const parts = objectPath.split("/");
  const fileName = parts.pop();
  const prefix = parts.join("/");
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/list/${DESTINATION_BUCKET}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefix, search: fileName, limit: 100, offset: 0 }),
    },
  );
  if (!response.ok) {
    throw new Error(`Consulta do Storage falhou (${response.status}): ${await response.text()}`);
  }
  const objects = await response.json();
  return Array.isArray(objects) && objects.some(item => item.name === fileName);
}

async function copyAndVerify(sourceUrl, objectPath) {
  if (await destinationExists(objectPath)) {
    return objectUrl(objectPath, true);
  }

  const source = await fetch(sourceUrl);
  if (!source.ok) throw new Error(`Download ${source.status}: ${sourceUrl}`);
  const contentType = source.headers.get("content-type") || "application/octet-stream";
  const bytes = await source.arrayBuffer();
  if (!bytes.byteLength) throw new Error(`Arquivo vazio: ${sourceUrl}`);

  const uploaded = await fetch(objectUrl(objectPath), {
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

  if (!(await destinationExists(objectPath))) {
    throw new Error(`Arquivo enviado, mas não foi possível validar a URL pública: ${objectPath}`);
  }
  return objectUrl(objectPath, true);
}

async function updateProperty(propertyId, photos, thumbnails) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/properties?id=eq.${encodeURIComponent(propertyId)}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ photos, photo_thumbnails: thumbnails }),
    },
  );
  if (!response.ok) {
    throw new Error(`Atualização do imóvel ${propertyId} falhou: ${response.status} ${await response.text()}`);
  }
  const updated = await response.json();
  if (!Array.isArray(updated) || updated.length !== 1) {
    throw new Error(`Atualização do imóvel ${propertyId} não confirmou exatamente uma linha.`);
  }
}

let offset = 0;
let scanned = 0;
let propertiesWithLegacyFiles = 0;
let copiedFiles = 0;
let updatedProperties = 0;
let failedProperties = 0;
let remainingLegacyReferences = 0;

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
    const legacyUrls = [...new Set([...photos, ...thumbnails].filter(isLegacyStorageUrl))];
    if (!legacyUrls.length) continue;

    propertiesWithLegacyFiles += 1;
    if (!APPLY && !UPLOAD_ONLY) {
      console.log(`[DRY RUN] ${property.id}: ${legacyUrls.length} arquivo(s) antigos`);
      remainingLegacyReferences += legacyUrls.length;
      continue;
    }

    try {
      const migrated = new Map();
      for (const sourceUrl of legacyUrls) {
        const objectPath = destinationFor(sourceUrl, property.id);
        migrated.set(sourceUrl, await copyAndVerify(sourceUrl, objectPath));
        copiedFiles += 1;
      }

      if (UPLOAD_ONLY) {
        console.log(`[COPIADO/VALIDADO - SEM ALTERAR BANCO] ${property.id}: ${migrated.size} arquivo(s)`);
        continue;
      }

      const nextPhotos = photos.map(value => migrated.get(value) || value);
      const nextThumbnails = thumbnails.map(value => migrated.get(value) || value);
      await updateProperty(property.id, nextPhotos, nextThumbnails);
      updatedProperties += 1;
      console.log(`[URLS ATUALIZADAS] ${property.id}: ${migrated.size} arquivo(s)`);
    } catch (error) {
      failedProperties += 1;
      console.error(`[ERRO] ${property.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  offset += rows.length;
  if (rows.length < PAGE_SIZE) break;
}

console.log(JSON.stringify({
  mode: APPLY ? "APPLY_DATABASE_URLS" : UPLOAD_ONLY ? "UPLOAD_ONLY_NO_DATABASE_WRITES" : "DRY_RUN_READ_ONLY",
  destinationProject: destinationHost,
  scannedProperties: scanned,
  propertiesWithLegacyFiles,
  copiedAndVerifiedFiles: copiedFiles,
  updatedProperties,
  failedProperties,
  remainingLegacyReferences: APPLY ? "recheck with DRY RUN after completion" : remainingLegacyReferences,
}, null, 2));

if (UPLOAD_ONLY) {
  if (failedProperties > 0) {
    console.error("Fase 1 incompleta: houve falhas na cópia/validação. Nenhuma linha de public.properties foi alterada.");
    process.exitCode = 1;
  } else {
    console.log("Fase 1 concluída: arquivos copiados e validados. Nenhuma linha de public.properties foi alterada.");
  }
} else if (!APPLY) {
  console.log("Nenhum dado foi alterado. Use --upload-only para copiar arquivos sem trocar URLs.");
}
