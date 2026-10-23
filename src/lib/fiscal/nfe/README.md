# NF-e / NFC-e module foundation

This directory starts the Model 55 (NF-e) and Model 65 (NFC-e) integration.

- sefaz-urls.server.ts: official SOAP 4.00 endpoints for SP, MG, SVRS and SVAN, with explicit UF routing and environment 1/2.
- nfe-xml-generator.server.ts: well-formed XML scaffold with official namespace and infNFe@Id = NFe + 44-digit access key.
- nfe-xml-signature.server.ts: XMLDSIG signature over infNFe, inserting Signature as a sibling under NFe.

## Important limitations

The generator intentionally does not claim to emit schema-valid invoices. NF-e/NFC-e requires all fields required by the current MOC, technical notes and XSD packages, including correct access-key calculation/check digit, taxes, totals and issuer/recipient/product data. Validate against official XSDs before signing and transmission.

The SOAP URLs and UF routing are a starter map, not nationwide coverage. States that use their own authorizers and are not mapped throw an explicit error. Do not enable them until production and homologation URLs are verified against the official portal.

This commit does not yet implement SOAP envelopes, nfeAutorizacaoLote/nfeDadosMsg, receipt polling, response parsing, contingency modes, NFC-e QR Code, persistence or idempotency. Those should be separate services with contract tests.

## Official references

- National NF-e web services: https://www.nfe.fazenda.gov.br/portal/webServices.aspx
- Homologation service directory: https://hom.nfe.fazenda.gov.br/portal/WebServices.aspx
- Minas Gerais: https://portalsped.fazenda.mg.gov.br/spedmg/nfe/webservices/
- São Paulo: https://portal.fazenda.sp.gov.br/servicos/nfe/Paginas/URL-WEBSERVICES.aspx
- SVRS portal: https://dfe-portal.svrs.rs.gov.br/NFE/Servicos
