-- Permite cadastrar contas a receber sem WhatsApp do cliente.
-- O campo continua validado quando preenchido; o envio de mensagens exige número cadastrado.
CREATE OR REPLACE FUNCTION public.enforce_entry_limits()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE acc jsonb; lim int; cnt int;
BEGIN
  IF current_user <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
  acc := public.get_access(auth.uid());
  IF NOT (acc->>'can_write')::boolean THEN
    RAISE EXCEPTION 'READ_ONLY' USING HINT = 'Assinatura necessária';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status = 'pending' AND (TG_OP = 'INSERT' OR OLD.status <> 'pending') THEN
    lim := (acc->'limits'->>'pending_entries')::int;
    SELECT count(*) INTO cnt FROM public.entries WHERE user_id = NEW.user_id AND status = 'pending';
    IF cnt >= lim THEN RAISE EXCEPTION 'LIMIT_PENDING' USING HINT = lim::text; END IF;
  END IF;
  RETURN NEW;
END $function$;
