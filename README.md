# Caixa Crítico

Previsão de caixa (15/30 dias) e preparação de cobranças para envio manual pelo WhatsApp. TanStack Start + Lovable Cloud.

## Segredos necessários (Lovable Cloud → Secrets)
| Nome | Uso |
|---|---|
| `ASAAS_API_KEY` | API privada do Asaas para Pix e cobrança de assinatura |
| `APP_URL` | URL pública, por exemplo `https://app.seudominio.com.br` |

## Fluxo de pagamento com Asaas
1. Configure a chave API do Asaas em `ASAAS_API_KEY` (sandbox ou produção).
2. Use o webhook público em `https://SEU_DOMINIO/api/public/asaas-webhook` para receber eventos de pagamento.
3. No Asaas, configure os eventos de pagamento necessários para confirmar as cobranças Pix.
4. O checkout cria o cliente, gera o QR Code Pix e salva `asaas_payment_id` em `subscriptions` até a confirmação.
5. Antes de ativar produção, confirme no painel do Asaas as tarifas vigentes da sua conta; não presuma que a ausência de mensalidade significa ausência de tarifa por transação.

## Cobranças pelo WhatsApp
- Selecione a conta e revise ou edite a mensagem antes de abrir o WhatsApp Web ou aplicativo.
- As mensagens são preparadas por links oficiais `wa.me`; o usuário confirma o envio no próprio WhatsApp.
- O projeto não envia mensagens de WhatsApp automaticamente. O envio automatizado depende de uma integração e credenciais próprias.
- O e-mail permanece disponível para autenticação da conta; o envio de e-mails transacionais depende da configuração do serviço existente.

## Regras no servidor
Limites e modo somente leitura são validados no banco (`get_access`, trigger `enforce_entry_limits`, `import_entries`) e nas server functions. `src/config/plans.ts` espelha `plan_limits` no SQL — altere os dois juntos.

## Checklist de publicação
- [ ] Confirmar credenciais Asaas de produção e o webhook `/api/public/asaas-webhook`; não configurar chaves Stripe como requisito do fluxo principal Asaas.
- [ ] Confirmar domínio público + `APP_URL`.
- [ ] Revisar Termos e Privacidade (trechos entre colchetes).
- [ ] Testar: cadastro → trial de 7 dias → 1ª conta → cobrança manual via WhatsApp → assinatura → falha de pagamento → cancelamento → exclusão de conta.
- [ ] Validar build, TypeScript, testes e migrations no CI antes de publicar.

## NFS-e Nacional — Produção Restrita

A emissão da NFS-e usa o ambiente de Produção Restrita e valida o XML da DPS contra o pacote XSD oficial antes de qualquer transmissão. O envio é bloqueado se o schema ou o validador não estiver disponível.

### Segredos do servidor

Configure os seguintes valores em **Lovable Cloud → Secrets** (ou no gerenciador de segredos do runtime de produção):

| Variável | Formato e finalidade |
|---|---|
| `FISCAL_ENCRYPTION_KEY` | **Base64 de exatamente 32 bytes** para AES-256-GCM. Gere com `openssl rand -base64 32`. O valor gerado tem 44 caracteres normalmente, incluindo o padding `=`. Não use uma frase/senha, não remova o padding e não compartilhe nem grave essa chave no repositório ou em tabelas do banco. Configure o mesmo valor em todas as instâncias que precisam descriptografar os certificados existentes. |
| `NFSE_DPS_XSD_PATH` | Caminho absoluto ou relativo ao diretório de trabalho para o arquivo principal `DPS_v1.01.xsd`. Caminho padrão: `supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd`. Os XSD importados/incluídos precisam permanecer na estrutura relativa original do pacote oficial. |
| `NFSE_XMLLINT_BIN` | Opcional. Caminho para o executável `xmllint`; se omitido, o código usa `xmllint` encontrado no `PATH`. |

**Atenção à chave:** trocar `FISCAL_ENCRYPTION_KEY` sem uma estratégia de rotação torna os certificados e senhas fiscais já criptografados ilegíveis. Guarde uma cópia segura conforme a política de recuperação de segredos da organização.

### Instalar `xmllint` (libxml2)

O runtime precisa conter o executável `xmllint`. Instale a dependência na imagem/container de execução, e não apenas no computador local:

```dockerfile
# Imagem Debian/Ubuntu
RUN apt-get update \
 && apt-get install -y --no-install-recommends libxml2-utils \
 && rm -rf /var/lib/apt/lists/*
```

Em servidor Debian/Ubuntu já existente:

```bash
sudo apt-get update
sudo apt-get install -y libxml2-utils
xmllint --version
```

Se o provedor de hospedagem não permitir instalar pacotes do sistema, use uma imagem/container customizado que inclua `libxml2-utils`. O deploy deve falhar no health check fiscal se `xmllint` ou o schema obrigatório estiver ausente; não desative a validação como alternativa.

### Obter e instalar o pacote XSD oficial

Use o pacote de **Produção Restrita** publicado no portal oficial, não um schema de produção, uma cópia antiga ou um arquivo isolado obtido de terceiros:

- [Documentação técnica oficial — Produção Restrita](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita)
- Pacote publicado em 20/10/2026: `NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020`.

Extraia o ZIP mantendo toda a hierarquia de arquivos e imports para:

```text
supabase/schemas/nfse/producao-restrita-20261020/
```

O arquivo de entrada esperado pelo validador é `DPS_v1.01.xsd`. Após instalar, confirme:

```bash
test -f supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd
xmllint --nonet --noout --schema \
  supabase/schemas/nfse/producao-restrita-20261020/DPS_v1.01.xsd \
  caminho/para/uma-dps-de-homologacao.xml
```

Não considere o ambiente pronto para emissão até o pacote oficial estar presente, o XML de teste ser validado localmente e o teste de integração confirmar que o mesmo caminho funciona no runtime de hospedagem.
