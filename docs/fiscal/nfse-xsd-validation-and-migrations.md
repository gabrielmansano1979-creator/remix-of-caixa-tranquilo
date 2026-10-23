# NFS-e Nacional — validação XSD e migrações

## Esquema oficial para Produção Restrita

A documentação oficial de homologação foi atualizada em 20/10/2026 e publica o pacote
`NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020`.

Fonte: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita

1. Baixe o pacote pelo link **NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020** nessa página.
2. Extraia o conteúdo completo (não apenas o XSD principal) para:
   `supabase/schemas/nfse/producao-restrita-20261020/`
3. Confirme que o arquivo principal `DPS_v1.01.xsd` e todos os XSD referenciados por `include`/`import` estão juntos na estrutura relativa original.
4. Instale o executável `xmllint` (libxml2) na imagem de runtime:
   - Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y libxml2-utils`
   - Em container, inclua `libxml2-utils` no estágio final da imagem, não somente no estágio de build.
5. Configure no ambiente do servidor:
   `NFSE_DPS_XSD_PATH=/caminho/absoluto/para/DPS_v1.01.xsd`
   Opcionalmente, configure `NFSE_XMLLINT_BIN` se o executável não estiver no PATH.
6. Teste um XML representativo com:
   `xmllint --nonet --noout --schema "$NFSE_DPS_XSD_PATH" ./dps-assinada.xml`

O código valida o XML assinado que será transmitido. Ausência do XSD, do executável, falha do validador ou qualquer violação do esquema bloqueia a transmissão. Não configure produção restrita para apontar para um XSD de produção ou para uma versão anterior.

## Migrações Supabase

O histórico remoto consultado já contém as versões `20261023193650` (rascunhos) e
`20261023195950` (configurações fiscais). Os nomes dos arquivos locais foram alinhados
a esses números para evitar reaplicação de migrações já registradas.

As duas migrações pendentes desta branch são:

- `20261023195960_fiscal_invoice_emission_foundation.sql`: campos de transmissão, tabela `fiscal_invoice_items` e políticas RLS.
- `20261023200000_nfse_draft_tax_fields_and_sequence.sql`: campos fiscais, sequência por empresa/série e trigger de alocação de número DPS.

Antes de aplicar, confira o projeto vinculado e a lista de pendências:

```bash
supabase login
supabase link --project-ref dygwbadhvwzajordpmst
supabase migration list --linked
```

Revise o diff e aplique as migrações pendentes:

```bash
supabase db push --linked
supabase migration list --linked
```

Confirme no resultado que as versões `20261023195960` e `20261023200000` aparecem aplicadas. Não use `migration repair` para marcar versões como aplicadas sem que o SQL correspondente tenha sido executado.

## Verificação pós-migração

Execute no SQL Editor do projeto Supabase de teste:

```sql
select to_regclass('public.fiscal_invoices') as fiscal_invoices,
       to_regclass('public.fiscal_invoice_items') as fiscal_invoice_items,
       to_regclass('public.configuracoes_fiscais') as configuracoes_fiscais,
       to_regclass('public.nfse_dps_sequences') as nfse_dps_sequences;

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'fiscal_invoices'
  and column_name in (
    'competencia', 'codigo_trib_nacional', 'cnae', 'iss_retido',
    'aliquota_iss', 'serie', 'numero_dps', 'tentativas_envio',
    'ambiente_fiscal', 'envio_iniciado_em'
  )
order by column_name;

select tgname
from pg_trigger
where tgrelid = 'public.fiscal_invoices'::regclass
  and not tgisinternal
  and tgname = 'fiscal_invoices_assign_dps_sequence';
```

As quatro relações devem existir, as colunas fiscais devem aparecer e a consulta de trigger deve retornar `fiscal_invoices_assign_dps_sequence`.

Depois da migração e de configurar o XSD no runtime, valide também o código antes de qualquer teste de emissão:

```bash
npm test
npx tsc --noEmit
npm run build
```
