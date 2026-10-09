ALTER TABLE public.profiles ADD COLUMN full_name text;
ALTER TABLE public.profiles ADD COLUMN notification_whatsapp text;
ALTER TABLE public.profiles ALTER COLUMN trial_ends_at SET DEFAULT (now() + interval '7 days');
ALTER TABLE public.entries ADD COLUMN pix_url text;
ALTER TABLE public.reminder_rules ADD COLUMN channel text NOT NULL DEFAULT 'email';
UPDATE public.reminder_rules SET channel = CASE WHEN offset_days = -2 THEN 'email' WHEN offset_days = 3 THEN 'whatsapp' ELSE 'both' END;
ALTER TABLE public.reminder_rules ADD CONSTRAINT reminder_rule_channel_valid CHECK (channel IN ('email','whatsapp','both'));
ALTER TABLE public.reminder_logs ADD COLUMN channel text NOT NULL DEFAULT 'whatsapp';
ALTER TABLE public.reminder_logs ADD COLUMN stage_rule_id uuid REFERENCES public.reminder_rules(id) ON DELETE SET NULL;
UPDATE public.reminder_logs SET stage_rule_id = rule_id;
ALTER TABLE public.reminder_logs ADD CONSTRAINT reminder_log_channel_valid CHECK (channel IN ('email','whatsapp'));
CREATE UNIQUE INDEX reminder_delivery_per_channel ON public.reminder_logs(entry_id, stage_rule_id, channel) WHERE stage_rule_id IS NOT NULL;
COMMENT ON COLUMN public.reminder_logs.rule_id IS 'DEPRECATED: replaced by stage_rule_id for new per-channel deliveries; retained for historical compatibility';
CREATE OR REPLACE FUNCTION public.ensure_user_setup() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); meta jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
 SELECT raw_user_meta_data INTO meta FROM auth.users WHERE id = uid;
 INSERT INTO public.profiles(user_id, trial_ends_at, full_name, business_name, notification_whatsapp)
 VALUES(uid, now() + interval '7 days', left(meta->>'full_name',120), left(meta->>'business_name',120), CASE WHEN meta->>'notification_whatsapp' ~ '^\+[1-9][0-9]{9,14}$' THEN meta->>'notification_whatsapp' ELSE NULL END) ON CONFLICT DO NOTHING;
 INSERT INTO public.subscriptions(user_id,status) VALUES(uid,'trialing') ON CONFLICT DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM public.reminder_rules WHERE user_id=uid) THEN
 INSERT INTO public.reminder_rules(user_id,label,offset_days,channel,subject_tpl,body_tpl) VALUES
 (uid,'Lembrete prévio',-2,'email','Lembrete: {{descricao}} vence em {{vencimento}}','Olá, {{cliente}}! Passando para lembrar que {{descricao}}, no valor de {{valor}}, vence em {{vencimento}}. Obrigado! — {{empresa}}'),
 (uid,'No vencimento',0,'both','Hoje vence: {{descricao}}','Olá, {{cliente}}! Hoje vence {{descricao}} ({{valor}}). Se já pagou, desconsidere. — {{empresa}}'),
 (uid,'3 dias de atraso',3,'whatsapp','Pagamento pendente: {{descricao}}','Olá, {{cliente}}. Não identificamos o pagamento de {{descricao}} ({{valor}}), vencido em {{vencimento}}. Pode verificar? — {{empresa}}'),
 (uid,'7 dias de atraso',7,'both','Segundo aviso: {{descricao}} em aberto','Olá, {{cliente}}. {{descricao}} ({{valor}}) segue em aberto desde {{vencimento}}. Responda para combinarmos. — {{empresa}}');
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.enforce_entry_limits() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE acc jsonb; lim int; cnt int;
BEGIN
 IF current_user <> 'authenticated' THEN RETURN COALESCE(NEW,OLD); END IF;
 acc := public.get_access(auth.uid());
 IF NOT (acc->>'can_write')::boolean THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF length(NEW.description) NOT BETWEEN 1 AND 200 OR NEW.amount_cents <= 0 OR length(COALESCE(NEW.counterparty_name,'')) > 120 THEN RAISE EXCEPTION 'INVALID_ENTRY'; END IF;
 IF NEW.counterparty_email IS NOT NULL AND (length(NEW.counterparty_email)>255 OR NEW.counterparty_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
 IF NEW.counterparty_whatsapp IS NOT NULL AND NEW.counterparty_whatsapp !~ '^\+[1-9][0-9]{9,14}$' THEN RAISE EXCEPTION 'INVALID_WHATSAPP'; END IF;
 IF NEW.pix_url IS NOT NULL AND (length(NEW.pix_url)>2000 OR NEW.pix_url !~ '^https://[^[:space:]]+$') THEN RAISE EXCEPTION 'INVALID_PIX_URL'; END IF;
 IF NEW.status='pending' AND (TG_OP='INSERT' OR OLD.status<>'pending') THEN
 lim := (acc->'limits'->>'pending_entries')::int;
 SELECT count(*) INTO cnt FROM public.entries WHERE user_id=NEW.user_id AND status='pending';
 IF cnt >= lim THEN RAISE EXCEPTION 'LIMIT_PENDING'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.validate_reminder_rule() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE a jsonb;
BEGIN
 IF length(NEW.label)>120 OR length(NEW.subject_tpl)>200 OR length(NEW.body_tpl)>3000 OR NEW.offset_days NOT BETWEEN -30 AND 60 THEN RAISE EXCEPTION 'INVALID_RULE'; END IF;
 IF current_user='authenticated' THEN
 a:=public.my_access();
 IF NOT (a->>'can_write')::boolean THEN RAISE EXCEPTION 'READ_ONLY'; END IF;
 IF a->>'plan'='starter' AND NEW.channel <> 'email' THEN RAISE EXCEPTION 'UPGRADE_REQUIRED'; END IF;
 IF TG_OP='UPDATE' THEN
 IF NOT (a->'limits'->>'edit_rule_days')::boolean AND (NEW.offset_days<>OLD.offset_days OR NEW.active<>OLD.active) THEN RAISE EXCEPTION 'UPGRADE_REQUIRED'; END IF;
 IF NOT (a->'limits'->>'edit_rule_texts')::boolean AND (NEW.subject_tpl<>OLD.subject_tpl OR NEW.body_tpl<>OLD.body_tpl) THEN RAISE EXCEPTION 'UPGRADE_REQUIRED'; END IF;
 END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reminder_rule_validation BEFORE INSERT OR UPDATE ON public.reminder_rules FOR EACH ROW EXECUTE FUNCTION public.validate_reminder_rule();
CREATE OR REPLACE FUNCTION public.validate_plg_profile() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF length(COALESCE(NEW.full_name,''))>120 OR length(COALESCE(NEW.business_name,''))>120 THEN RAISE EXCEPTION 'INVALID_PROFILE'; END IF;
 IF NEW.notification_whatsapp IS NOT NULL AND NEW.notification_whatsapp !~ '^\+[1-9][0-9]{9,14}$' THEN RAISE EXCEPTION 'INVALID_WHATSAPP'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER profile_plg_validation BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.validate_plg_profile();