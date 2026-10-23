# NFS-e Nacional — XSD Produção Restrita 1.01 (20/10/2026)

These schemas mirror the official package `NFSe-ESQUEMAS_XSD-PRODREST-v1.01-20261020`, published by the Brazilian National NFS-e portal for the restricted-production/test environment.

Official source:
https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/producao-restrita/esquemas_prod_restrita_20261020.zip

The files were cross-referenced from a public mirror of that dated official package:
https://github.com/flaviolacer/nfse-brazil-national/tree/da650e7421469cf6bbca40a43dad871170aaa126/src/templates/xsd/restricted-2026-10-20

Keep all files together because root schemas import other XSDs by relative filename. Do not replace this set with production schemas or an older v1.01 archive without validating the exact target environment's current package.

Entry schema used by the DPS validator: `DPS_v1.01.xsd`.

After any update, verify the files against the official archive and run `xmllint --nonet --noout --schema DPS_v1.01.xsd <test-dps.xml>` in the application runtime.
