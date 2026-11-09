import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HTML_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_PHOTOS = 35;
const USER_AGENT = "Mozilla/5.0 (compatible; VersusCRM/1.0)";

function isPrivateAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a,b] = address.split(".").map(Number);
    return a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) ||
      (a===172&&b>=16&&b<=31) || (a===192&&b===168) ||
      (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19));
  }
  if (version === 6) {
    const ip=address.toLowerCase();
    return ip==="::" || ip==="::1" || ip.startsWith("fc") || ip.startsWith("fd") ||
      ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") ||
      ip.startsWith("feb") || ip.startsWith("::ffff:127.") ||
      ip.startsWith("::ffff:10.") || ip.startsWith("::ffff:192.168.");
  }
  return true;
}

async function validatePublicUrl(value: string): Promise<URL> {
  const url=new URL(value);
  if (!["http:","https:"].includes(url.protocol) || url.username || url.password) throw new Error("Informe um link HTTP ou HTTPS público.");
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  if (!host || host==="localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Endereço de origem não permitido.");
  const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true,verbatim:true});
  if (!addresses.length || addresses.some((entry)=>isPrivateAddress(entry.address))) throw new Error("O endereço de origem não é público.");
  return url;
}

async function safeFetch(value: string, maxBytes: number, accept: string) {
  let current=value;
  for(let attempt=0;attempt<4;attempt++){
    const url=await validatePublicUrl(current);
    const response=await fetch(url,{redirect:"manual",headers:{"User-Agent":USER_AGENT,Accept:accept},signal:AbortSignal.timeout(15000)});
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get("location");
      if(!location || attempt===3) throw new Error("O portal redirecionou para um endereço não permitido.");
      current=new URL(location,url).toString(); continue;
    }
    if(!response.ok) throw new Error("O portal respondeu com HTTP "+response.status+".");
    if(Number(response.headers.get("content-length")||0)>maxBytes) throw new Error("O arquivo remoto excede o tamanho permitido.");
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(bytes.byteLength>maxBytes) throw new Error("O arquivo remoto excede o tamanho permitido.");
    return {response,url,bytes};
  }
  throw new Error("Não foi possível acessar o endereço informado.");
}

function decodeHtml(value:string):string {
  return value.replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,n:string)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi,(_,n:string)=>String.fromCodePoint(parseInt(n,16)));
}
function plainText(html:string):string {
  return decodeHtml(html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ")).trim();
}
function meta(html:string,key:string):string {
  const escaped=key.replace(/[.*+?^$()|[\]\\]/g,"\\$&");
  const patterns=[
    new RegExp('<meta[^>]+(?:property|name)=["\\']'+escaped+'["\\'][^>]+content=["\\']([^"\\']+)["\\']',"i"),
    new RegExp('<meta[^>]+content=["\\']([^"\\']+)["\\'][^>]+(?:property|name)=["\\']'+escaped+'["\\']',"i")
  ];
  for(const pattern of patterns){const match=html.match(pattern);if(match?.[1])return decodeHtml(match[1].trim());}
  return "";
}
function firstString(...values:unknown[]):string {
  for(const value of values){if(typeof value==="string"&&value.trim())return value.trim();if(typeof value==="number"&&Number.isFinite(value))return String(value);}
  return "";
}
function numeric(value:unknown):number|null {
  if(typeof value==="number"&&Number.isFinite(value))return value;
  if(typeof value!=="string")return null;
  const cleaned=value.replace(/[^\d,.-]/g,"").replace(/\.(?=\d{3}(?:\D|$))/g,"").replace(",",".");
  const parsed=Number(cleaned);return Number.isFinite(parsed)&&parsed>0?parsed:null;
}
type JsonRecord=Record<string,unknown>;
function flattenJsonLd(value:unknown,out:JsonRecord[]=[]):JsonRecord[] {
  if(Array.isArray(value)) value.forEach((item)=>flattenJsonLd(item,out));
  else if(value&&typeof value==="object"){
    const item=value as JsonRecord;out.push(item);
    if(item["@graph"])flattenJsonLd(item["@graph"],out);
    if(item.mainEntity)flattenJsonLd(item.mainEntity,out);
    if(item.itemListElement)flattenJsonLd(item.itemListElement,out);
  }
  return out;
}
function extractListing(html:string):JsonRecord {
  const objects:JsonRecord[]=[];
  for(const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{flattenJsonLd(JSON.parse(decodeHtml(match[1])),objects);}catch{/* Ignore invalid structured data. */}
  }
  const listing=objects.find((item)=>{
    const type=Array.isArray(item["@type"])?item["@type"].join(" "):String(item["@type"]||"");
    return /RealEstateListing|Residence|Apartment|House|SingleFamilyResidence|Product/i.test(type);
  })??objects.find((item)=>item.name||item.headline)??{};
  const address=(listing.address&&typeof listing.address==="object"?listing.address:{}) as JsonRecord;
  const offers=(listing.offers&&typeof listing.offers==="object"?listing.offers:{}) as JsonRecord;
  const floor=(listing.floorSize&&typeof listing.floorSize==="object"?listing.floorSize:{}) as JsonRecord;
  const place=(listing.containedInPlace&&typeof listing.containedInPlace==="object"?listing.containedInPlace:{}) as JsonRecord;
  const images=Array.isArray(listing.image)?listing.image:listing.image?[listing.image]:[];
  const photos=[...new Set([...images.map((item)=>typeof item==="string"?item:firstString((item as JsonRecord)?.url,(item as JsonRecord)?.contentUrl)),meta(html,"og:image"),meta(html,"twitter:image")].filter((item)=>/^https?:\/\//i.test(item)))].slice(0,MAX_PHOTOS);
  const title=firstString(listing.name,listing.headline,meta(html,"og:title"),meta(html,"twitter:title"));
  const description=firstString(listing.description,meta(html,"og:description"),meta(html,"description"));
  const price=numeric(offers.price??listing.price??meta(html,"product:price:amount"));
  const text=plainText(html).slice(0,12000);
  const rent=/aluguel|loca[cç][aã]o|por m[eê]s|mensal/i.test(title+" "+text);
  const sale=/venda|comprar|vende-se/i.test(title+" "+text);
  const street=firstString(address.streetAddress);
  const streetMatch=street.match(/^(.*?)(?:,|\s+n[º°.]?\s*)(\d+[A-Za-z]?)$/i);
  const amenities=Array.isArray(listing.amenityFeature)?listing.amenityFeature.map((item)=>firstString((item as JsonRecord)?.name,item)).filter(Boolean):[];
  const result:JsonRecord={
    title,description,property_type:firstString(listing.additionalType,listing["@type"]).replace(/https?:\/\/schema.org\//,""),
    price:price&&!rent?price:null,rent_price:price&&rent?price:null,
    area:numeric(floor.value??listing.floorSize),bedrooms:numeric(listing.numberOfBedrooms),suites:null,
    bathrooms:numeric(listing.numberOfBathroomsTotal??listing.numberOfBathrooms),parking:numeric(listing.numberOfParkingSpaces),
    cep:firstString(address.postalCode).replace(/\D/g,""),address:streetMatch?.[1]?.trim()||street,number:streetMatch?.[2]||"",
    neighborhood:firstString(address.addressNeighborhood,address.neighborhood),city:firstString(address.addressLocality),state:firstString(address.addressRegion),
    condo_fee:null,iptu:null,unit_number:"",condominium_name:firstString(place.name,(listing.isPartOf as JsonRecord|undefined)?.name),
    features:amenities,photos,transaction_type:rent&&sale?"both":rent?"rent":sale?"sale":""
  };
  if(!title&&!description&&!price&&!photos.length)throw new Error("O portal não disponibilizou dados estruturados do imóvel. Preencha os campos manualmente.");
  return result;
}

async function importImages(request:NextRequest,body:JsonRecord) {
  const authorization=request.headers.get("authorization");
  if(!authorization?.startsWith("Bearer "))return NextResponse.json({error:"Sessão não autenticada."},{status:401});
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anonKey||!serviceKey)return NextResponse.json({error:"Configuração administrativa do Supabase incompleta."},{status:503});
  const auth=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
  const {data:{user},error:authError}=await auth.auth.getUser();
  if(authError||!user)return NextResponse.json({error:"Sessão expirada. Entre novamente."},{status:401});
  const companyId=String(body.companyId??""),propertyId=String(body.propertyId??"");
  const photos=Array.isArray(body.photos)?[...new Set(body.photos.filter((item):item is string=>typeof item==="string"))]:[];
  if(!companyId||!propertyId||!photos.length||photos.length>MAX_PHOTOS)return NextResponse.json({error:"Dados de importação de fotos inválidos."},{status:400});
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:membership},{data:owner}]=await Promise.all([
    admin.from("crm_memberships").select("role").eq("company_id",companyId).eq("user_id",user.id).maybeSingle(),
    admin.from("crm_owner_accounts").select("contact_id").eq("company_id",companyId).eq("user_id",user.id).eq("status","active").maybeSingle()
  ]);
  const {data:property,error:propertyError}=await admin.from("properties").select("id,company_id,owner_contact_id,photos").eq("id",propertyId).eq("company_id",companyId).maybeSingle();
  if(propertyError||!property)return NextResponse.json({error:"Imóvel não encontrado nesta imobiliária."},{status:404});
  if(!membership&&(!owner||owner.contact_id!==property.owner_contact_id))return NextResponse.json({error:"Você não tem permissão para importar fotos para este imóvel."},{status:403});
  const {data:company,error:companyError}=await admin.from("crm_companies").select("status,max_photos_per_property").eq("id",companyId).maybeSingle();
  if(companyError||!company||company.status!=="active")return NextResponse.json({error:"Imobiliária inativa ou não encontrada."},{status:403});
  const limit=Math.max(0,Number(company.max_photos_per_property??35));
  const current=Array.isArray(property.photos)?property.photos:[];
  const externalCount=current.filter((item:string)=>!String(item).includes("/storage/v1/object/public/crm-property-photos/")).length;
  const folder=companyId+"/"+propertyId;
  const {data:stored,error:listError}=await admin.storage.from("crm-property-photos").list(folder,{limit:100});
  if(listError)return NextResponse.json({error:"Não foi possível validar o limite de fotos."},{status:503});
  if(externalCount+(stored?.length??0)+photos.length>limit)return NextResponse.json({error:"O plano desta imobiliária permite no máximo "+limit+" fotos por imóvel."},{status:403});
  const uploaded:string[]=[];const publicUrls:string[]=[];let total=0;
  try{
    for(let i=0;i<photos.length;i++){
      const fetched=await safeFetch(photos[i],MAX_IMAGE_BYTES,"image/avif,image/webp,image/png,image/jpeg,image/gif");
      const type=(fetched.response.headers.get("content-type")||"").split(";")[0].toLowerCase();
      const extensions:Record<string,string>={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif","image/gif":"gif"};
      const extension=extensions[type];if(!extension)throw new Error("O portal retornou um arquivo que não é uma imagem compatível.");
      total+=fetched.bytes.byteLength;if(total>MAX_TOTAL_IMAGE_BYTES)throw new Error("O conjunto de fotos excede o limite total de importação.");
      const objectPath=folder+"/import-"+Date.now()+"-"+i+"-"+crypto.randomUUID()+"."+extension;
      const {error}=await admin.storage.from("crm-property-photos").upload(objectPath,Buffer.from(fetched.bytes),{contentType:type,upsert:false});
      if(error)throw new Error("Falha ao armazenar uma foto: "+error.message);
      uploaded.push(objectPath);publicUrls.push(admin.storage.from("crm-property-photos").getPublicUrl(objectPath).data.publicUrl);
    }
    return NextResponse.json({photos:publicUrls});
  }catch(error){
    if(uploaded.length)await admin.storage.from("crm-property-photos").remove(uploaded);
    return NextResponse.json({error:error instanceof Error?error.message:"Falha ao importar as fotos."},{status:400});
  }
}

export async function POST(request:NextRequest) {
  try{
    const body=await request.json() as JsonRecord;
    if(body.action==="import_images")return importImages(request,body);
    const source=String(body.url??"").trim();
    if(!source||source.length>2048)return NextResponse.json({error:"Informe um link válido para o anúncio."},{status:400});
    const fetched=await safeFetch(source,MAX_HTML_BYTES,"text/html,application/xhtml+xml");
    return NextResponse.json(extractListing(new TextDecoder().decode(fetched.bytes)),{headers:{"Cache-Control":"no-store"}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:"Não foi possível importar os dados deste anúncio."},{status:400});
  }
}
