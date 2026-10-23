-- Reusable format profiles for bank-statement interpretation.
-- These rows describe document layouts and safe parsing rules; they contain no customer data.
CREATE TABLE IF NOT EXISTS public.statement_import_profiles (
  institution_key text PRIMARY KEY CHECK (institution_key ~ '^[a-z0-9_]{2,60}$'),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
  supported_formats text[] NOT NULL CHECK (cardinality(supported_formats) > 0),
  detection_markers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(detection_markers) = 'object'),
  parsing_rules jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parsing_rules) = 'object'),
  example_signatures jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(example_signatures) = 'array'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.statement_import_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.statement_import_profiles TO authenticated;
DROP POLICY IF EXISTS "Authenticated users can read statement import profiles" ON public.statement_import_profiles;
CREATE POLICY "Authenticated users can read statement import profiles"
  ON public.statement_import_profiles FOR SELECT TO authenticated USING (true);

INSERT INTO public.statement_import_profiles
  (institution_key, display_name, supported_formats, detection_markers, parsing_rules, example_signatures, enabled)
VALUES
(
  'nubank_pdf',
  'Nubank — extrato PDF',
  ARRAY['pdf'],
  '{"institution":["Nubank","Nu Pagamentos","Nu Financeira"],"layout":["daily_transaction_blocks","multiline_descriptions"]}'::jsonb,
  '{"date_formats":["DD MMM YYYY","DD/MM/YYYY"],"money_locale":"pt-BR","direction":["explicit_sign","operation_label"],"ignore":["saldo anterior","saldo final","saldo do dia","total de entradas","total de saídas"],"operations":["Pix recebido","Pix enviado","compra","NuPay","estorno"],"rules":["Join continuation lines with the active transaction; never import daily totals as movements.","Keep refunds as separate movements and link them to originals only when evidence supports it.","Preserve source description and page reference when available."]}'::jsonb,
  '[{"date":"01 SET 2026","amount":"+34,00","type":"Pix recebido"},{"date":"01 SET 2026","amount":"-18,49","type":"Pix enviado"},{"amount":"43,50","type":"estorno"}]'::jsonb,
  true
),
(
  'infinitepay_csv',
  'InfinitePay — extrato CSV',
  ARRAY['csv'],
  '{"headers":["CODIGO DA TRANSACAO","DATA","TIPO","DESCRICAO","VALOR"],"delimiter":";"}'::jsonb,
  '{"date_formats":["DD/MM/YYYY"],"money_locale":"pt-BR","signed_amount":true,"operation_types":["Pix enviado","Pix recebido","Vendas"],"rules":["Use the transaction code as a source identifier when available; do not assume it proves settlement status.","A Vendas row is a card-sales settlement, not a named individual payer.","Do not infer paid/settled status because the export has no status column.","Reject or flag inconsistent operation/sign combinations for review."]}'::jsonb,
  '[{"type":"Pix enviado","description":"Pix enviado para FORNECEDOR","amount":"-640,37"},{"type":"Pix recebido","description":"Pix recebido de CLIENTE","amount":"574,00"},{"type":"Vendas","description":"Disponivel DEBITO VISA","amount":"66,37"}]'::jsonb,
  true
),
(
  'infinitepay_pdf',
  'InfinitePay — extrato PDF',
  ARRAY['pdf'],
  '{"institution":["InfinitePay","CloudWalk"],"headers":["Data","Hora","Tipo de transação","Nome","Detalhe","Valor (R$)"]}'::jsonb,
  '{"date_formats":["DD MMM, YYYY","DD/MM/YYYY"],"time_format":"HH:MM","money_locale":"pt-BR","signed_amount":true,"ignore":["Saldo do dia"],"operations":["venda","Empréstimo Inteligente","Pix","estorno","boleto"],"rules":["Treat the signed amount as the movement direction when it is clear.","Do not import daily balances as transactions.","Loan amortization is a financing movement, not an ordinary operating expense.","Refunds must not automatically be treated as new sales revenue."]}'::jsonb,
  '[{"date":"02 Set, 2026","type":"depósito de vendas","amount":"+342,49"},{"type":"Empréstimo Inteligente","amount":"-90,50"},{"type":"estorno","amount":"+251,18"}]'::jsonb,
  true
),
(
  'pagbank_pdf',
  'PagBank — extrato PDF',
  ARRAY['pdf'],
  '{"institution":["PagBank","PagSeguro"],"headers":["Data","Descrição","Valor"],"daily_summary":"Saldo do dia"}'::jsonb,
  '{"date_formats":["DD/MM/YYYY"],"money_locale":"pt-BR","signed_amount":true,"ignore":["Saldo do dia","saldo anterior","saldo final"],"operations":["Pix enviado","Pix recebido","Renda Fixa - Aplicação em CDB","Renda Fixa - Resgate total de CDB"],"rules":["CDB application and rescue are internal investment movements, not operating revenue/expense.","Keep those movements in cash movement history but exclude them from operating performance calculations.","Avoid double-counting when the investment account is also imported."]}'::jsonb,
  '[{"type":"Renda Fixa - Aplicação em CDB","amount":"-545,99","is_own_transfer":true},{"type":"Renda Fixa - Resgate total de CDB","amount":"+600,00","is_own_transfer":true},{"type":"Pix recebido","amount":"+520,43"}]'::jsonb,
  true
),
(
  'itau_pdf',
  'Itaú — extrato PDF',
  ARRAY['pdf'],
  '{"institution":["Itaú","Itau Unibanco"],"headers":["Data","Lançamentos","Razão Social","CNPJ/CPF","Valor (R$)","Saldo (R$)"]}'::jsonb,
  '{"date_formats":["DD/MM/YYYY"],"money_locale":"pt-BR","signed_amount":true,"balance_column":"Saldo (R$)","ignore":["SALDO ANTERIOR","saldo acumulado","saldo final"],"operations":["JUROS EXCESSO LIM CONTA","DEB AUTOR","EST DB","RECEBIMENTOS"],"rules":["The balance column is cumulative and is never a transaction amount.","Saldo anterior is an opening balance, not a movement.","Keep debit and reversal as separate movements; relate them only with supporting evidence.","Do not automatically classify a receipt as operating revenue based only on the counterparty label.","Flag suspicious repeated or inconsistent balances for review."]}'::jsonb,
  '[{"type":"SALDO ANTERIOR","amount":"-113319,29","import_as_movement":false},{"type":"JUROS EXCESSO LIM CONTA","amount":"-3508,16"},{"type":"EST DB AUTMETROPOLI SEG","amount":"+347,65"}]'::jsonb,
  true
)
ON CONFLICT (institution_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  supported_formats = EXCLUDED.supported_formats,
  detection_markers = EXCLUDED.detection_markers,
  parsing_rules = EXCLUDED.parsing_rules,
  example_signatures = EXCLUDED.example_signatures,
  enabled = EXCLUDED.enabled,
  updated_at = now();
