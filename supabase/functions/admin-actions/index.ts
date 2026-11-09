import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const generateInitialPassword = () => {
 const bytes = new Uint8Array(24);
 crypto.getRandomValues(bytes);
 return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
};
Deno.serve(async req => {
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return out({error:"Método não permitido."},405);
 try {
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if(!url||!anon||!key) return out({error:"Configuração do Supabase incompleta."},500);
  const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
  if(!token) return out({error:"Sessão administrativa ausente."},401);
  const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:u,error:ue}=await auth.auth.getUser(token);
  if(ue||!u.user) return out({error:"Sessão inválida."},401);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:p,error:pe}=await db.from("profiles").select("role").eq("id",u.user.id).maybeSingle();
  if(pe||p?.role!=="admin") return out({error:"Somente o administrador do VersusCRM pode executar esta operação."},403);
  const b=await req.json().catch(()=>null), action=String(b?.action||"");
  if(action==="provision") {
   const companyId=String(b.companyId||""),email=String(b.email||"").trim().toLowerCase(),companyName=String(b.companyName||"").trim();
   if(!companyId||!companyName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return out({error:"Empresa, nome e e-mail válidos são obrigatórios."},400);
   const {data:c,error:ce}=await db.from("crm_companies").select("id,name,contact_name,contact_email").eq("id",companyId).maybeSingle();
   if(ce||!c||String(c.contact_email||"").trim().toLowerCase()!==email) return out({error:"Empresa não encontrada ou e-mail diferente do cadastro."},400);
   const {data:m,error:me}=await db.from("crm_memberships").select("user_id").eq("company_id",companyId).maybeSingle();
   if(me) return out({error:"Não foi possível verificar os vínculos existentes."},500);
   if(m) return out({error:"Esta empresa já possui um usuário vinculado. Nenhuma conta foi alterada."},409);
   const initialPassword=generateInitialPassword(); let userId:string|undefined,created=false;
   for(let page=1;page<=10&&!userId;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)return out({error:"Não foi possível verificar contas existentes."},500);const found=data.users.find(x=>String(x.email||"").trim().toLowerCase()===email);if(found)userId=found.id;if(data.users.length<1000)break;}
   if(userId){const {data:links,error}=await db.from("crm_memberships").select("company_id").eq("user_id",userId);if(error)return out({error:"Não foi possível validar os vínculos da conta existente."},500);if((links||[]).some(x=>x.company_id!==companyId))return out({error:"Este e-mail já está vinculado a outra empresa."},409);const {error}=await db.auth.admin.updateUserById(userId,{password:initialPassword,email_confirm:true,user_metadata:{company_id:companyId,company_name:c.name}});if(error)return out({error:"Não foi possível definir a senha inicial: "+error.message},400);}
   else{const {data,error}=await db.auth.admin.createUser({email,password:initialPassword,email_confirm:true,user_metadata:{company_id:companyId,company_name:c.name}});if(error||!data.user)return out({error:error?.message||"Não foi possível criar a conta."},400);userId=data.user.id;created=true;}
   const {error:prof}=await db.from("profiles").upsert({id:userId,full_name:c.contact_name||c.name,role:"owner"},{onConflict:"id"});
   if(prof){if(created&&userId)await db.auth.admin.deleteUser(userId);return out({error:"Falha ao criar perfil: "+prof.message},500);}
   const {error:link}=await db.from("crm_memberships").insert({company_id:companyId,user_id:userId,role:"owner"});
   if(link){if(created&&userId)await db.auth.admin.deleteUser(userId);return out({error:"Falha ao vincular usuário: "+link.message},500);}
   return out({ok:true,email,role:"owner",profileCreated:true,accessCreated:true,initialPassword});
  }
  if(action==="manage-access") {
   const companyId=String(b.companyId||"").trim(),password=String(b.password||"");
   if(!companyId||password.length<12)return out({error:"Informe a empresa e uma senha com pelo menos 12 caracteres."},400);
   const {data:c,error:ce}=await db.from("crm_companies").select("id,name,contact_name,contact_email").eq("id",companyId).maybeSingle();
   if(ce||!c||!c.contact_email)return out({error:"Empresa não encontrada ou sem e-mail de contato."},404);
   const email=String(c.contact_email).trim().toLowerCase();
   const {data:ms,error:me}=await db.from("crm_memberships").select("user_id,company_id").eq("company_id",companyId).limit(2);
   if(me)return out({error:"Não foi possível consultar o vínculo da empresa."},500);
   if((ms||[]).length>1)return out({error:"A empresa possui múltiplos usuários vinculados."},409);
   let userId:string|undefined,createdId:string|undefined;
   if(ms?.[0]?.user_id){userId=ms[0].user_id;const {error}=await db.auth.admin.updateUserById(userId,{password,email,email_confirm:true,user_metadata:{company_id:companyId,company_name:c.name}});if(error)return out({error:"Não foi possível atualizar a senha: "+error.message},400);}
   else{
    let existing:any;
    for(let page=1;page<=10&&!existing;page++){const {data,error}=await db.auth.admin.listUsers({page,perPage:1000});if(error)return out({error:"Não foi possível verificar contas existentes."},500);existing=data.users.find(x=>String(x.email||"").trim().toLowerCase()===email);if(data.users.length<1000)break;}
    if(existing){const {data:links,error}=await db.from("crm_memberships").select("company_id").eq("user_id",existing.id);if(error)return out({error:"Não foi possível validar os vínculos da conta existente."},500);if((links||[]).some(x=>x.company_id!==companyId))return out({error:"Este e-mail já está vinculado a outra empresa."},409);userId=existing.id;const {error:up}=await db.auth.admin.updateUserById(userId,{password,email_confirm:true,user_metadata:{company_id:companyId,company_name:c.name}});if(up)return out({error:"Não foi possível atualizar a conta: "+up.message},400);}
    else{const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{company_id:companyId,company_name:c.name}});if(error||!data.user)return out({error:"Não foi possível criar o acesso: "+(error?.message||"usuário não retornado")},400);userId=data.user.id;createdId=userId;}
    const {error:link}=await db.from("crm_memberships").insert({company_id:companyId,user_id:userId,role:"owner"});if(link){if(createdId)await db.auth.admin.deleteUser(createdId);return out({error:"Falha ao vincular usuário: "+link.message},500);}
   }
   const verifier=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
   const {data:v,error:ve}=await verifier.auth.signInWithPassword({email,password});
   if(ve||!v.user||v.user.id!==userId)return out({error:"A senha foi gravada, mas a validação do login falhou."},502);
   await verifier.auth.signOut();
   const {error:sync}=await db.from("profiles").upsert({id:userId,full_name:c.contact_name||c.name,role:"owner"},{onConflict:"id"});
   if(sync)return out({error:"A senha foi validada, mas não foi possível sincronizar o perfil: "+sync.message},500);
   return out({ok:true,email,companyName:c.name,credentialsVerified:true,profileSynchronized:true,membershipSynchronized:true,action:ms?.length?"password_reset":"access_created"});
  }
  if(action==="decide-catalog") {
   const id=String(b.requestId||""),decision=String(b.decision||"");
   if(!id||!["approved","rejected"].includes(decision))return out({error:"Solicitação e decisão válidas são obrigatórias."},400);
   const {data:item,error:re}=await db.from("crm_catalog_change_requests").select("*").eq("id",id).eq("status","pending").maybeSingle();
   if(re||!item)return out({error:"Solicitação não encontrada ou já analisada."},409);
   if(decision==="approved"){
    const table=item.entity_type==="developer"?"crm_developers":item.entity_type==="condominium"?"crm_condominiums":null;
    const fields:Record<string,string[]>={developer:["name","legal_name","document","phone","website","partnership_manager_name","partnership_manager_phone","description","logo_url","active"],condominium:["name","address","neighborhood","city","state","construction_year","builder","details"]};
    const allowed=fields[item.entity_type];if(!table||!allowed)return out({error:"Tipo de cadastro não reconhecido."},400);
    const values=Object.fromEntries(Object.entries(item.proposed_data||{}).filter(([k])=>allowed.includes(k)));
    if(item.action==="create"){if(!values.name)return out({error:"O cadastro não possui nome."},400);const {error}=await db.from(table).insert({...values,company_id:item.company_id,...(item.entity_type==="developer"?{created_by:item.requested_by}:{})});if(error)return out({error:"Não foi possível criar o cadastro: "+error.message},400);}
    else{if(!item.record_id)return out({error:"Registro de destino não informado."},400);const {data:existing,error}=await db.from(table).select("id,company_id").eq("id",item.record_id).maybeSingle();if(error||!existing||existing.company_id!==item.company_id)return out({error:"Registro não encontrado para esta imobiliária."},404);if(item.action==="update"){const {error}=await db.from(table).update(values).eq("id",item.record_id).eq("company_id",item.company_id);if(error)return out({error:"Não foi possível aplicar as alterações: "+error.message},400);}else if(item.action==="delete"){const {error}=await db.from(table).delete().eq("id",item.record_id).eq("company_id",item.company_id);if(error)return out({error:"Não foi possível excluir o cadastro: "+error.message},400);}else return out({error:"Ação não reconhecida."},400);}
   }
   const {error:de}=await db.from("crm_catalog_change_requests").update({status:decision,decision_by:u.user.id,decision_at:new Date().toISOString(),decision_note:String(b.note||"").trim()||null,updated_at:new Date().toISOString()}).eq("id",id).eq("status","pending");
   if(de)return out({error:"A decisão foi executada, mas não foi possível registrar o resultado: "+de.message},500);
   return out({ok:true,status:decision});
  }
  return out({error:"Ação administrativa desconhecida."},400);
 } catch(e){return out({error:e instanceof Error?e.message:"Erro interno."},500);}
});