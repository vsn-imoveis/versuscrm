const https = require("https");
const http = require("http");
const dns = require("node:dns").promises;
const net = require("node:net");
const { createClient } = require("@supabase/supabase-js");

function privateAddress(address) {
 const ip=String(address||"").toLowerCase().split("%")[0];
 if(net.isIPv4(ip)){
  const [a,b,c]=ip.split(".").map(Number);
  return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113);
 }
 if(net.isIPv6(ip)){
  if(ip==="::"||ip==="::1"||ip.startsWith("fc")||ip.startsWith("fd")||/^fe[89ab]/.test(ip)||ip.startsWith("ff")||!/^2[0-9a-f]{3}:/i.test(ip))return true;
  const mapped=ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if(mapped)return privateAddress(mapped[1]);
 }
 return true;
}
async function resolvePublicTarget(target){
 const host=target.hostname.toLowerCase().replace(/^\[|\]$/g,"");
 if(!["http:","https:"].includes(target.protocol)||target.username||target.password||host==="localhost"||host.endsWith(".localhost"))throw new Error("Endereço de imagem não permitido.");
 const records=await dns.lookup(host,{all:true,verbatim:true});
 if(!records.length||records.some(r=>privateAddress(r.address)))throw new Error("O endereço da imagem não é público.");
 return records[0];
}
async function downloadImage(target, redirects=0){
 if(redirects>3)throw new Error("A imagem redirecionou muitas vezes.");
 const resolved=await resolvePublicTarget(target);
 const client=target.protocol==="https:"?https:http;
 return await new Promise((resolve,reject)=>{
  const request=client.get(target,{headers:{"User-Agent":"Mozilla/5.0 VersusCRM Image Import","Accept":"image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5"},timeout:12000,lookup:(_h,_o,cb)=>cb(null,resolved.address,resolved.family)},response=>{
   if(response.statusCode>=300&&response.statusCode<400&&response.headers.location){
    response.resume();let next;try{next=new URL(response.headers.location,target)}catch(_){return reject(new Error("Redirecionamento de imagem inválido."))}
    return downloadImage(next,redirects+1).then(resolve,reject);
   }
   if(response.statusCode<200||response.statusCode>=300){response.resume();return reject(new Error("O portal não liberou uma foto (HTTP "+response.statusCode+")."))}
   const mime=String(response.headers["content-type"]||"").split(";")[0].trim().toLowerCase();
   const extensions={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/avif":"avif","image/gif":"gif"};
   if(!extensions[mime]){response.resume();return reject(new Error("O arquivo recebido não é uma imagem compatível."))}
   const chunks=[];let size=0;
   response.on("data",chunk=>{size+=chunk.length;if(size>8*1024*1024){request.destroy(new Error("Cada foto importada deve ter até 8 MB."));response.destroy();}else chunks.push(chunk)});
   response.on("end",()=>{const buffer=Buffer.concat(chunks);if(!buffer.length)return reject(new Error("A imagem veio vazia."));resolve({buffer,mime,ext:extensions[mime]})});
   response.on("error",reject);
  });
  request.on("timeout",()=>request.destroy(new Error("Tempo limite ao baixar uma foto.")));
  request.on("error",reject);
 });
}
async function importImages(req,res){
 const authorization=String(req.headers.authorization||"");
 if(!authorization.startsWith("Bearer "))return send(res,401,{error:"Sessão não autenticada."});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const anon=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!service)return send(res,503,{error:"Configuração do Supabase incompleta."});
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
 const {data:{user},error:authError}=await auth.auth.getUser();
 if(authError||!user)return send(res,401,{error:"Sessão expirada. Entre novamente."});
 const companyId=String(req.body?.companyId||"").trim(),propertyId=String(req.body?.propertyId||"").trim();
 const urls=Array.isArray(req.body?.photos)?req.body.photos:[];
 if(!/^[0-9a-f-]{36}$/i.test(companyId)||!/^[0-9a-f-]{36}$/i.test(propertyId)||!urls.length||urls.length>35)return send(res,400,{error:"Imóvel, imobiliária ou lista de fotos inválida."});
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const [{data:membership,error:memberError},{data:property,error:propertyError}]=await Promise.all([
  admin.from("crm_memberships").select("role").eq("company_id",companyId).eq("user_id",user.id).maybeSingle(),
  admin.from("properties").select("id").eq("id",propertyId).eq("company_id",companyId).maybeSingle()
 ]);
 if(memberError||!membership||propertyError||!property)return send(res,403,{error:"Você não tem permissão para importar fotos neste imóvel."});
 const uploaded=[];
 try{
  for(let i=0;i<urls.length;i++){
   const raw=String(urls[i]||"");let target;
   try{target=new URL(raw)}catch(_){throw new Error("Uma das URLs de foto é inválida.")}
   if(!["http:","https:"].includes(target.protocol))throw new Error("URL de foto não permitida.");
   const file=await downloadImage(target);
   const path=companyId+"/"+propertyId+"/import_"+Date.now()+"_"+i+"."+file.ext;
   const result=await admin.storage.from("crm-property-photos").upload(path,file.buffer,{contentType:file.mime,upsert:false,cacheControl:"31536000"});
   if(result.error)throw result.error;
   uploaded.push(admin.storage.from("crm-property-photos").getPublicUrl(path).data.publicUrl);
  }
  return send(res,200,{photos:uploaded});
 }catch(error){
  if(uploaded.length){
   const paths=uploaded.map(publicUrl=>{const part=publicUrl.split("/crm-property-photos/")[1];return part?decodeURIComponent(part.split("?")[0]):null}).filter(Boolean);
   if(paths.length)await admin.storage.from("crm-property-photos").remove(paths);
  }
  return send(res,422,{error:error.message||"Não foi possível importar as fotos."});
 }
}

function send(res,status,data){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.setHeader("Cache-Control","no-store");return res.end(JSON.stringify(data));}
function decode(s){return String(s||"").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).trim();}
function plain(s){return decode(String(s||"").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," "));}
function meta(html,key){
 const tags=String(html||"").match(/<meta\b[^>]*>/gi)||[];
 const attr=(tag,name)=>{const re=new RegExp("\\b"+name+"\\s*=\\s*([\"'])(.*?)\\1","i");const m=tag.match(re);return m?decode(m[2]):"";};
 for(const tag of tags){const ident=attr(tag,"property")||attr(tag,"name")||attr(tag,"itemprop");if(ident.toLowerCase()===String(key).toLowerCase()){const val=attr(tag,"content");if(val)return val;}}
 return "";
}
function embeddedData(html){
 const out=[];const seen=new Set();
 const walk=(x,depth=0)=>{if(!x||depth>16)return;if(Array.isArray(x)){x.slice(0,5000).forEach(v=>walk(v,depth+1));return;}if(typeof x!=="object"||seen.has(x))return;seen.add(x);out.push(x);Object.keys(x).forEach(k=>{if(x[k]&&typeof x[k]==="object")walk(x[k],depth+1);});};
 const parseFragments=(raw)=>{
  let depth=0,start=-1,inString=false,escaped=false,count=0;
  for(let i=0;i<raw.length&&count<2500;i++){
   const c=raw[i];
   if(inString){if(escaped)escaped=false;else if(c==="\\")escaped=true;else if(c==='"')inString=false;continue;}
   if(c==='"'){inString=true;continue;}
   if(c==="{"){if(depth===0)start=i;depth++;}
   else if(c==="}"&&depth>0){depth--;if(depth===0&&start>=0){const chunk=raw.slice(start,i+1);if(chunk.length<2000000){try{walk(JSON.parse(chunk));count++;}catch(_){}}start=-1;}}
  }
 };
 const re=/<script([^>]*)>([\s\S]*?)<\/script>/gi;let m;
 while((m=re.exec(html))){
  const attrs=m[1]||"",body=m[2]||"";
  if(body.length>4000000)continue;
  const isJsonLd=/type=["']application\/ld\+json["']/i.test(attrs);
  const isJson=/type=["']application\/json["']/i.test(attrs);
  const isState=/__NEXT_DATA__|__INITIAL_STATE__|__APOLLO_STATE__|__NUXT__|__PRELOADED_STATE__/i.test(attrs+" "+body.slice(0,500));
  if(isJsonLd||isJson||isState){try{walk(JSON.parse(body.trim().replace(/^<!--|-->$/g,"").trim()));continue;}catch(_){}}
  // Next.js App Router streams page data through self.__next_f.push(...), not ordinary JSON script tags.
  if(/__next_f|__NEXT_DATA__|__INITIAL_STATE__|__APOLLO_STATE__|__NUXT__|__PRELOADED_STATE__|bedrooms|dormitorios|salePrice|rentPrice|floorSize|parkingSpaces|condoPrice|condominiumFee/i.test(attrs+" "+body)){
   const pushRe=/__next_f\.push\(\s*(\[[\s\S]*?\])\s*\)\s*;?/g;let pm;
   while((pm=pushRe.exec(body))){try{const arr=JSON.parse(pm[1]);if(Array.isArray(arr)){for(const item of arr){if(typeof item==="string")parseFragments(item);else if(item&&typeof item==="object")walk(item);}}}catch(_){}}
   parseFragments(body);
  }
 }
 return out;
}
function deepValue(nodes,keys){
 const wanted=new Set(keys.map(k=>String(k).toLowerCase().replace(/[^a-z0-9]/g,"")));
 for(const n of nodes){for(const [k,v] of Object.entries(n||{})){const nk=k.toLowerCase().replace(/[^a-z0-9]/g,"");if(wanted.has(nk)&&v!==null&&v!==undefined&&v!==""&&typeof v!=="object")return v;}}
 return null;
}
function propertyNode(nodes){
 let best=null,bestScore=0;
 const types=x=>Array.isArray(x["@type"])?x["@type"].join(" "):String(x["@type"]||"");
 for(const x of nodes){
  const t=types(x);
  if(/Organization|WebSite|WebPage|BreadcrumbList|PostalAddress|Person|LocalBusiness|ContactPoint|SiteNavigationElement/i.test(t)&&!/RealEstate|Residence|Apartment|House|Product/i.test(t))continue;
  const hasPropertySignals=!!(x.offers||x.price||x.salePrice||x.rentalPrice||x.rentPrice||x.floorSize||x.area||x.usableArea||x.privateArea||x.totalArea||x.numberOfBedrooms||x.bedrooms||x.bedroomCount||x.dormitorios||x.numberOfBathroomsTotal||x.parkingSpaces);
  const typedProperty=/Product|Residence|Apartment|House|SingleFamilyResidence|RealEstateListing|Accommodation|RealEstate/i.test(t);
  // An address alone is not enough: footer/contact JSON often contains a business address.
  if(!hasPropertySignals&&!typedProperty)continue;
  let score=0;
  if(typedProperty)score+=8;
  if(x.offers||x.price||x.salePrice||x.rentalPrice||x.rentPrice)score+=5;
  if(x.floorSize||x.area||x.usableArea||x.privateArea||x.totalArea)score+=4;
  if(x.numberOfBedrooms||x.bedrooms||x.bedroomCount||x.dormitorios)score+=4;
  if(x.numberOfBathroomsTotal||x.bathrooms||x.bathroomCount)score+=2;
  if(x.address&&typeof x.address==="object")score+=2;
  if(x.name||x.headline||x.title)score+=1;
  if(score>bestScore){best=x;bestScore=score;}
 }
 return best||{};
}
function valueFrom(nodes,keys){
 for(const n of nodes){for(const k of keys){const v=n?.[k];if(v!==undefined&&v!==null&&v!==""&&typeof v!=="object")return v;}}
 return null;
}
function collectFeatures(nodes,pageText="",title="",description="",isQuintoAndar=false){
 const out=[];const seen=new Set();
 const add=v=>{if(!v)return;if(typeof v==="string"){const x=plain(v).trim();if(x&&x.length<100&&!seen.has(x)){seen.add(x);out.push(x);}return;}if(Array.isArray(v)){v.forEach(add);return;}if(typeof v==="object"){if(typeof v.name==="string")add(v.name);else if(typeof v.value==="string")add(v.value);else if(typeof v.label==="string")add(v.label);else if(typeof v.description==="string")add(v.description);}};
 if(!isQuintoAndar){for(const n of nodes){for(const k of ["features","amenities","amenityFeature","propertyFeatures","propertyAmenities","characteristics","attributes","differentials","condominiumFeatures","leisure","facilities"]){if(n&&n[k]!==undefined)add(n[k]);}}}
 // Fallback: map portal-specific labels and visible feature names to the exact options used by the VSN form.
 const canonical=[
 ["Acabamento em alto padrão",["acabamento alto padrao","alto padrao"]],
 ["Adega",["adega"]],
 ["Ambientes integrados",["ambientes integrados","integracao de ambientes"]],
 ["Aquecimento a gás",["aquecimento a gas"]],
 ["Ar Condicionado",["ar condicionado","ar-condicionado","climatizacao"]],
 ["Área de serviço",["area de servico","lavanderia"]],
 ["Banheira",["banheira"]],
 ["Blackout nas janelas",["blackout","persiana blackout"]],
 ["Box no banheiro",["box no banheiro","box de vidro"]],
 ["Churrasqueira",["churrasqueira"]],
 ["Closet",["closet"]],
 ["Copa",["copa"]],
 ["Cozinha planejada",["cozinha planejada","armarios planejados na cozinha","moveis planejados na cozinha"]],
 ["Dependência para funcionários",["dependencia de empregada","dependencia para funcionarios","quarto de empregada"]],
 ["Depósito",["deposito","despensa externa"]],
 ["Despensa",["despensa"]],
 ["Dormitório para hóspedes",["dormitorio para hospedes","quarto de hospedes"]],
 ["Eletrodomésticos",["eletrodomesticos","eletrodomesticos inclusos"]],
 ["Elevador privativo",["elevador privativo"]],
 ["Escritório",["escritorio","home office"]],
 ["Espaço gourmet",["espaco gourmet"]],
 ["Fechadura digital",["fechadura digital","fechadura eletronica"]],
 ["Garden",["garden","jardim privativo"]],
 ["Hall de entrada",["hall de entrada"]],
 ["Hidromassagem",["hidromassagem","hidro"]],
 ["Infraestrutura de ar condicionado",["infraestrutura para ar condicionado","preparacao para ar condicionado"]],
 ["Isolamento acústico",["isolamento acustico"]],
 ["Lareira",["lareira"]],
 ["Lavabo",["lavabo"]],
 ["Lavanderia",["lavanderia"]],
 ["Mobiliado",["mobiliado","totalmente mobiliado","semi mobiliado","semi-mobiliado"]],
 ["Móveis planejados",["moveis planejados","marcenaria planejada"]],
 ["Pé direito alto",["pe direito alto"]],
 ["Piscina",["piscina"]],
 ["Piso aquecido",["piso aquecido"]],
 ["Piso de cerâmica",["piso ceramica","piso de ceramica"]],
 ["Piso de granito",["piso granito","piso de granito"]],
 ["Piso de madeira",["piso madeira","piso de madeira"]],
 ["Piso de mármore",["piso marmore","piso de marmore"]],
 ["Piso laminado",["piso laminado"]],
 ["Piso porcelanato",["porcelanato","piso porcelanato"]],
 ["Quarto(s) com armário(s)",["quarto com armarios","dormitorio com armarios","armarios embutidos"]],
 ["Quarto(s) com sacada",["quarto com sacada","dormitorio com sacada"]],
 ["Reformado",["reformado","reformada","reforma recente"]],
 ["Sacada",["sacada"]],
 ["Sacada com churrasqueira",["sacada com churrasqueira","varanda com churrasqueira"]],
 ["Sauna",["sauna"]],
 ["Tanque de lavar roupa",["tanque de lavar roupa"]],
 ["Teto em gesso",["teto em gesso","sanca de gesso","forro de gesso"]],
 ["Varanda",["varanda"]],
 ["Varanda gourmet",["varanda gourmet"]],
 ["Aceita pets",["aceita pets","pet friendly","permite animais"]]
 ];
 const norm=v=>plain(String(v||"")).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim();
 const qaText=norm(pageText);
 const availableStart=qaText.indexOf("itens disponiveis");
 const unavailableStart=qaText.indexOf("itens indisponiveis");
 const hasQuintoAndarSections=availableStart>=0&&unavailableStart>availableStart;
 const featureSource=isQuintoAndar
   ? (hasQuintoAndarSections?qaText.slice(availableStart+"itens disponiveis".length,unavailableStart):"")
   : norm(description||title);
 const hasPhrase=(text,phrase)=>{const t=" "+norm(text)+" ",p=" "+norm(phrase)+" ";return t.includes(p);};
 const negatives=["nao possui","nao tem","nao conta com","sem ","nao aceita","nao disponivel"];
 const condoOnly=["piscina do condominio","piscina no condominio","piscina do empreendimento","piscina na area comum","churrasqueira do condominio","churrasqueira no condominio","academia do condominio"];
 for(const [label,aliases] of canonical){
  const matched=aliases.some(a=>hasPhrase(featureSource,a));
  if(!matched)continue;
  const aliasFound=aliases.find(a=>hasPhrase(featureSource,a));
  const idx=featureSource.indexOf(norm(aliasFound));
  const around=featureSource.slice(Math.max(0,idx-45),idx+norm(aliasFound).length+20);
  if(negatives.some(n=>around.includes(norm(n))))continue;
  if(label==="Piscina"&&condoOnly.some(n=>norm(description||title).includes(norm(n))))continue;
  add(label);
 }
 return out.slice(0,80);
}
function inferPropertyType(nodes,title,description){
 const v=String(deepValue(nodes,["propertyType","realEstateType","property_type","typeOfUnit","unitType"])||"");
 const raw=(v+" "+title+" "+description).toLocaleLowerCase("pt-BR");
 if(/cobertura/.test(raw))return "Cobertura";
 if(/studio|est[uú]dio/.test(raw))return "Studio";
 if(/casa de condom[ií]nio|sobrado em condom[ií]nio/.test(raw))return "Casa de condomínio";
 if(/apartamento|apto\\b/.test(raw))return "Apartamento";
 if(/terreno|lote/.test(raw))return "Terreno";
 if(/sala comercial|conjunto comercial|escrit[oó]rio comercial/.test(raw))return "Sala comercial";
 if(/casa|sobrado/.test(raw))return "Casa";
 return "";
}
function imageValues(nodes){
 const out=[];const seen=new Set();const add=v=>{if(!v||seen.has(v))return;if(typeof v==="string"){seen.add(v);if(/^https?:\/\//i.test(v)&&!out.includes(v))out.push(v);return;}if(Array.isArray(v)){seen.add(v);v.forEach(add);return;}if(typeof v==="object"){seen.add(v);add(v.url);add(v.contentUrl);add(v.src);add(v.image);add(v.images);add(v.thumbnailUrl);add(v.photo);add(v.photos);add(v.content);}};
 for(const n of nodes){add(n.image);add(n.images);add(n.thumbnailUrl);add(n.photo);add(n.photos);add(n.coverImage);add(n.mainImage);}
 return out;
}
function num(v){if(v===null||v===undefined||v==="")return null;if(typeof v==="number")return v;const s=String(v).replace(/[^\d,.-]/g,"");if(!s)return null;let n;if(s.includes(",")&&s.includes("."))n=Number(s.lastIndexOf(",")>s.lastIndexOf(".")?s.replace(/\./g,"").replace(",","."):s.replace(/,/g,""));else n=Number(s.replace(",","."));return Number.isFinite(n)?n:null;}
function find(t,re){const m=String(t||"").match(re);return m?m[1].trim():"";}
module.exports=async function(req,res){
 if(req.method!=="POST")return send(res,405,{error:"Método não permitido."});
 if(req.body?.action==="import_images")return importImages(req,res);
 try{
  const raw=String(req.body?.url||"").trim();let u;try{u=new URL(raw);}catch(_){return send(res,400,{error:"Informe um link válido."});}
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password)return send(res,400,{error:"O link deve usar HTTP ou HTTPS."});
  function isPrivateAddress(address){
   const ip=String(address||"").toLowerCase().split("%")[0];
   if(net.isIPv4(ip)){
    const [a,b,c]=ip.split(".").map(Number);
    return a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||(b===0&&c===0)||(b===0&&c===2)))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113);
   }
   if(net.isIPv6(ip)){
    if(ip==="::"||ip==="::1"||ip.startsWith("fc")||ip.startsWith("fd")||/^fe[89ab]/.test(ip)||ip.startsWith("ff")||ip.startsWith("2001:db8:"))return true;
    const mapped=ip.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if(mapped)return isPrivateAddress(mapped[1]);
   }
   return false;
  }
  async function safeTarget(target){
   const h=target.hostname.toLowerCase().replace(/^\[|\]$/g,"");
   if(!["http:","https:"].includes(target.protocol)||target.username||target.password||h==="localhost"||h.endsWith(".localhost"))throw new Error("O link redirecionou para um endereço não permitido.");
   let records;
   try{records=await dns.lookup(h,{all:true,verbatim:true});}catch(_){throw new Error("Não foi possível validar o endereço do portal.");}
   if(!records.length||records.some(record=>isPrivateAddress(record.address)))throw new Error("O link redirecionou para um endereço não permitido.");
   return records[0];
  }
  async function fetchHtml(target,redirects=0){if(redirects>5)throw new Error("O anúncio redirecionou muitas vezes.");const resolved=await safeTarget(target);const client=target.protocol==="https:"?https:http;return await new Promise((resolve,reject)=>{const rq=client.get(target,{headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8","Accept-Language":"pt-BR,pt;q=0.9,en;q=0.8"},timeout:15000,lookup:(_hostname,_options,callback)=>callback(null,resolved.address,resolved.family)},rp=>{if(rp.statusCode>=300&&rp.statusCode<400&&rp.headers.location){rp.resume();let next;try{next=new URL(rp.headers.location,target);}catch(_){return reject(new Error("O site enviou um redirecionamento inválido."));}return fetchHtml(next,redirects+1).then(resolve,reject);}if(rp.statusCode<200||rp.statusCode>=300){rp.resume();return reject(new Error("O portal bloqueou ou recusou a leitura (HTTP "+rp.statusCode+")."));}if(!String(rp.headers["content-type"]||"").toLowerCase().includes("html")){rp.resume();return reject(new Error("O link não retornou uma página HTML."));}let d="";rp.setEncoding("utf8");rp.on("data",c=>{d+=c;if(d.length>4000000)rq.destroy(new Error("Página muito grande para importar."));});rp.on("end",()=>resolve(d));});rq.on("timeout",()=>rq.destroy(new Error("Tempo limite ao acessar o anúncio.")));rq.on("error",reject);});}
  const html=await fetchHtml(u);
  const nodes=embeddedData(html);
  const p=propertyNode(nodes);
  const o=Array.isArray(p.offers)?p.offers[0]:(p.offers||{});
  const a=p.address||{};
  const deep=(keys)=>deepValue(nodes,keys);
  const first=(...values)=>values.find(v=>v!==null&&v!==undefined&&v!=="");
  const title=first(p.name,p.headline,p.title,deep(["listingTitle","propertyTitle","displayTitle","title"]),meta(html,"og:title"),meta(html,"twitter:title"),find(html,/<title[^>]*>([\s\S]*?)<\/title>/i))||"";
  const description=first(p.description,deep(["listingDescription","propertyDescription","descriptionText","description"]),meta(html,"og:description"),meta(html,"description"))||"";
  const price=num(first(o.price,p.price,p.salePrice,p.rentalPrice,p.rentPrice,deep(["salePrice","sale_price","price","askingPrice","rentPrice","rentalPrice","monthlyRent"]),meta(html,"product:price:amount"),find(plain(html),/(R\$\s*[\d.]+(?:,[\d]{2})?)/i)));
  // Varre o texto visível inteiro: muitos portais não incluem as características no JSON-LD.
  const pageText=plain(html);
  const text=plain(description+" "+title+" "+pageText), images=[];
  const listingId=(u.pathname.match(/\/imovel\/(\d+)/i)||[])[1];
  const photoKeys=new Set();
  const add=x=>{
    if(Array.isArray(x)){x.forEach(add);return;}
    const v=typeof x==="string"?x:(x?.url||x?.contentUrl||x?.src);
    if(!v)return;
    let absolute;
    try{absolute=new URL(decode(v),u.origin).toString();}catch(_){return;}
    if(!/^https?:\/\//i.test(absolute))return;
    const path=absolute.split(/[?#]/)[0];
    // Procura FotoN no caminho inteiro, não só no último segmento:
    // alguns formatos do QuintoAndar acrescentam sufixos ou pastas após o nome da foto.
    const photoMatch=path.match(/(?:^|[_/.-])Foto[_-]?(\d+)(?=[^0-9]|$)/i);
    let key;
    if(photoMatch&&listingId){
      key="quintoandar:"+listingId+":foto:"+Number(photoMatch[1]);
    }else{
      // Fallback para URLs sem FotoN: remove dimensões de crop, query e fragmento.
      const normalized=path
        .replace(/\/img\/crop\/(?:square|landscape)\/\d+x\d+\/original\//i,"/img/original/")
        .replace(/\/(?:square|landscape)\/\d+x\d+\//i,"/")
        .replace(/\/+/g,"/");
      key=normalized.toLowerCase();
    }
    if(!photoKeys.has(key)){
      photoKeys.add(key);
      images.push(absolute);
    }
  };
  (Array.isArray(p.image)?p.image:[p.image]).forEach(add);
  imageValues(nodes).forEach(add);
  add(meta(html,"og:image"));add(meta(html,"twitter:image"));
  // QuintoAndar: as URLs da galeria são assets diretos e podem estar em src/srcset/data-src.
  const imgRe=/<img\b[^>]*>/gi;let im;
  while((im=imgRe.exec(html))&&images.length<80){
    const tag=im[0];
    const attrRe=/(?:src|data-src|data-lazy-src|data-original)\s*=\s*["']([^"']+)["']/gi;let am;
    while((am=attrRe.exec(tag))&&images.length<80)add(am[1]);
    const srcset=tag.match(/\bsrcset\s*=\s*["']([^"']+)["']/i);
    if(srcset)srcset[1].split(",").forEach(part=>add(part.trim().split(/\s+/)[0]));
  }
  // QuintoAndar: identifica URLs da galeria contendo o ID do anúncio e FotoN.
  if(listingId){
    const photoPattern=new RegExp(
      "(?:https?:\\\\/\\\\/www\\\\.quintoandar\\\\.com\\\\.br)?\\\\/img\\\\/crop\\\\/(?:square\\\\/\\\\d+x\\\\d+|landscape\\\\/\\\\d+x\\\\d+)\\\\/original\\\\/[^\\\"'<>\\\\s]*?"+listingId+"[^\\\"'<>\\\\s]*?(?:Foto|foto)\\\\d+\\\\.jpe?g",
      "gi"
    );
    let pm;while((pm=photoPattern.exec(html))&&images.length<80)add(pm[0]);
  }
  // Referências escapadas em scripts/JSON.
  const escapedPhoto=/(?:https?:\\?\/\\?\/www\.quintoandar\.com\.br)?\\?\/img\\?\/crop\\?\/(?:square\\?\/\d+x\d+|landscape\\?\/\d+x\d+)\\?\/original\\?\/[^"'<>\\\s]*?(?:Foto|foto)\d+\.jpe?g/gi;
  let ep;while((ep=escapedPhoto.exec(html))&&images.length<80)add(ep[0].replace(/\\\//g,"/").replace(/\\/g,""));
  // Campos numéricos são lidos por rótulos próximos para evitar capturar números aleatórios do rodapé.
  const labeled=(labels)=>{for(const label of labels){const esc=label.replace(/ /g,"\\s+");const re=new RegExp(esc+"\\s*[:\\-]?\\s*(?:R\\$\\s*)?([\\d.]+(?:,[\\d]{1,2})?)","i");const m=pageText.match(re);if(m)return m[1];}return "";};
  const labeledArea=labeled(["área privativa","área útil","área total","metragem","área"]);
  const labeledBeds=labeled(["dormitórios","dormitório","quartos","quarto"]);
  const labeledSuites=labeled(["suítes","suíte"]);
  const labeledBaths=labeled(["banheiros","banheiro"]);
  const labeledParking=labeled(["vagas","vaga","garagens","garagem"]);
  const condoFee=num(first(p.condoPrice,p.condoFee,p.condominiumFee,p.condo_fee,deep(["condoPrice","condoFee","condominiumFee","condominiumValue","monthlyCondoFee","condo_fee"]),labeled(["condomínio","valor do condomínio","taxa condominial"])));
  const iptu=num(first(p.iptu,p.propertyTax,p.iptuValue,deep(["iptu","iptuValue","propertyTax","annualPropertyTax","taxValue"]),labeled(["iptu","iptu anual","valor do iptu"])));
  const constructionYear=num(first(p.constructionYear,p.yearBuilt,p.year_of_construction,deep(["constructionYear","yearBuilt","yearOfConstruction","builtYear"]),labeled(["ano de construção","ano de construcao","construído em","construida em"])));
  const condoMatch=pageText.match(/(?:condom[ií]nio|empreendimento)\s*[:\-]?\s*([A-ZÀ-Ú][^|•\n]{2,90})/i);
  const full=typeof a==="string"?a:[a.streetAddress,a.addressLocality,a.addressRegion].filter(Boolean).join(", ");
  const structuredPurpose=String(first(p.transactionType,p.transaction_type,p.businessType,p.listingType,p.offerType,p.purpose,deep(["transactionType","transaction_type","businessType","listingType","offerType","purpose"]))||"").toLocaleLowerCase("pt-BR");
  const purposeText=plain(title+" "+description+" "+structuredPurpose).toLocaleLowerCase("pt-BR");
  const pathText=decode(u.pathname+" "+u.search).toLocaleLowerCase("pt-BR");
  const saleSignal=/(?:\bcomprar\b|\bcompra\b|\bà venda\b|\ba venda\b|\bvenda\b|\bsale\b)/i.test(purposeText)||/(?:^|[\/_-])(?:comprar|compra|venda|sale)(?:[\/_?&=-]|$)/i.test(pathText);
  const rentSignal=/(?:\balugar\b|\baluguel\b|\bloca[cç][aã]o\b|\brent\b|\bfor rent\b)/i.test(purposeText)||/(?:^|[\/_-])(?:alugar|aluguel|locacao|rent)(?:[\/_?&=-]|$)/i.test(pathText);
  const rent=rentSignal&&!saleSignal;
  const transactionType=rentSignal&&saleSignal?"both":rent?"rent":saleSignal?"sale":"";
  const propertyType=inferPropertyType(nodes,title,description);
  const features=collectFeatures(nodes,pageText,title,description,/quintoandar\.com\.br$/i.test(u.hostname));
  const result={property_type:propertyType,features,title:plain(title).slice(0,220),description:plain(description||pageText.slice(0,8000)).slice(0,8000),price:rent?null:(price||num(labeled(["preço","valor de venda","venda"]))),rent_price:rent?(price||num(labeled(["aluguel","valor da locação","valor mensal"]))):null,transaction_type:transactionType,area:num(first(p.floorSize?.value,p.floorSize,p.area,p.usableArea,p.privateArea,p.totalArea,p.livingArea,deep(["usableArea","privateArea","totalArea","livingArea","floorSize","area","areaM2","area_m2","squareMeters"]),labeledArea,find(text,/([\d.,]+)\s*m(?:²|2|etros quadrados)/i))),bedrooms:num(first(p.numberOfBedrooms,p.bedrooms,p.bedroomCount,p.dormitorios,p.quartos,deep(["numberOfBedrooms","bedrooms","bedroomCount","bedroomQuantity","dormitorios","quartos","rooms"]),labeledBeds,find(text,/(\d+)\s*(?:quartos?|dormitórios?)/i))),suites:num(first(p.suites,p.suiteCount,deep(["suites","suiteCount","suiteQuantity"]),labeledSuites,find(text,/(\d+)\s*s[uú]ites?/i))),bathrooms:num(first(p.numberOfBathroomsTotal,p.bathrooms,p.bathroomCount,p.banheiros,deep(["numberOfBathroomsTotal","bathrooms","bathroomCount","bathroomQuantity","banheiros"]),labeledBaths,find(text,/(\d+)\s*banheiros?/i))),parking:num(first(p.parkingSpaces,p.parking,p.garageSpaces,p.vagas,deep(["parkingSpaces","parking","garageSpaces","garageCount","parkingCount","vagas"]),labeledParking,find(text,/(\d+)\s*(?:vagas?|garagens?)/i))),condo_fee:condoFee,iptu,construction_year:constructionYear,address:a.streetAddress||"",number:a.streetAddress?find(a.streetAddress,/[, ]+(\d+[A-Za-z]?)(?:\s|$)/):"",cep:a.postalCode||"",neighborhood:a.addressNeighborhood||a.neighborhood||"",city:a.addressLocality||"",state:a.addressRegion||"",condominium_name:first(p.condominiumName,p.condoName,p.buildingName,deep(["condominiumName","condoName","buildingName","developmentName","projectName"]),condoMatch?condoMatch[1].trim().split(/\s{2,}/)[0].slice(0,90):"")||"",photos:images.slice(0,35),source_url:u.toString()}
  if(![result.title,result.description,result.price,result.area,result.address].some(v=>v!==null&&v!==undefined&&v!=="")){
   const plainPage=plain(html).slice(0,1200).toLowerCase();
   if(/captcha|verifique se você é humano|access denied|acesso negado|cloudflare|robot check/.test(plainPage))return send(res,422,{error:"O portal bloqueou a leitura automática (proteção antirobô)."});
   return send(res,422,{error:"A página abriu, mas o portal não entregou dados estruturados suficientes. Pode carregar os dados por JavaScript ou exigir integração específica."});
  }
  return send(res,200,result);
 }catch(e){return send(res,422,{error:e.message||"Não foi possível ler o anúncio. O site pode bloquear acessos automáticos."});}
};
