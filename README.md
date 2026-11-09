# Versus CRM

Rebuild do Versus CRM a partir da base visual e funcional do VSN Imóveis, preparado para arquitetura SaaS multiempresa.

## Princípios

- Repositório independente: `vsn-imoveis/versuscrm`.
- Banco do Versus separado do banco legado do VSN Imóveis.
- Toda leitura e escrita de dados deve ser isolada por `company_id`.
- A rota pública de cada imobiliária usa seu `slug`.
- Não importar APIs, chaves, configurações ou SQL do Supabase legado do VSN.

## Estado

Fundação inicial em construção. As páginas HTML originais do VSN serão migradas após revisão para remover dependências e credenciais do banco legado e adaptar autenticação e dados ao modelo multi-tenant.
