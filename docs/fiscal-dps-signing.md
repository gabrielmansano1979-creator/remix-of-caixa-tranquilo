# DPS Nacional: geração, assinatura e envio

## Arquivos

- `src/lib/fiscal/dps/xml-generator.server.ts`: gera a estrutura inicial de XML da DPS a partir de dados tipados.
- `src/lib/fiscal/dps/xml-signature.server.ts`: extrai a chave privada e o certificado correspondente do PFX e assina a referência a `infDPS@Id`.
- `src/lib/fiscal/dps/dps-submission.server.ts`: envia o XML assinado usando a conexão mTLS de uma configuração fiscal autorizada.

## Dependências

As dependências de runtime são `xml-crypto`, `@xmldom/xmldom` e `axios`. A extração do PFX usa o executável OpenSSL do servidor (ou o caminho definido em `OPENSSL_BIN`). Estes módulos rodam no servidor Node.js; não importar em componentes do navegador.

## Segurança

1. A autenticação do usuário e a autorização para o tenant precisam acontecer antes de chamar qualquer service.
2. Não enviar PFX, senha, chave privada ou XML fiscal completo a logs, telemetria ou respostas de erro públicas.
3. O agente HTTPS precisa continuar com `rejectUnauthorized: true`.
4. Não desativar a verificação TLS em homologação.
5. A chave privada é extraída em memória do PFX descriptografado. Evitar persistir os PEMs extraídos e manter a duração de vida dos buffers tão curta quanto possível.

## Importante: ainda não é emissão pronta para produção

O gerador é um esqueleto tipado e **não está certificado contra o XSD oficial**. Antes de habilitar emissão real, é necessário:

- validar a sequência, cardinalidade, tipos, tamanhos e enumerações de todos os campos contra a versão vigente do pacote oficial de XSD e do Anexo I;
- validar assinatura e algoritmo contra as notas técnicas atuais;
- obter os parâmetros municipais e aplicar as regras de negócio aplicáveis;
- testar assinatura e envio em produção restrita com certificado autorizado;
- adicionar testes com XMLs de referência e verificar a assinatura após serialização.

O Manual dos Contribuintes do Emissor Público Nacional descreve o serviço síncrono `POST /nfse` como recepção de um XML que representa a DPS. Por isso, o service de envio envia o XML DPS assinado diretamente ao endpoint `/SefinNacional/nfse`, em vez de fabricar um envelope legado `EnviarLoteDpsEnvio/ListaDps` para essa API. Confirmar o path final na documentação Swagger do ambiente implantado.

## Referências oficiais

- Documentação Atual (Produção): https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- Manual dos Contribuintes - Emissor Público Nacional: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf
- API SEFIN Nacional: https://sefin.nfse.gov.br/SefinNacional/docs/index
- API de produção restrita: https://sefin.producaorestrita.nfse.gov.br/SefinNacional/docs/index
