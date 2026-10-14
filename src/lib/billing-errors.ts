// Only allowlisted messages cross the checkout boundary. Never expose provider bodies.
export function checkoutErrorMessage(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : "";
  if (["42P01", "42703", "PGRST204", "PGRST205"].includes(code)) {
    return "O Pix está temporariamente indisponível: a estrutura de cobrança precisa ser atualizada pelo responsável. Nenhuma nova cobrança foi gerada nesta tentativa.";
  }
  if (["42501", "PGRST301"].includes(code)) return "Não foi possível acessar os dados de cobrança. O responsável precisa verificar as permissões.";
  if (message.includes("Unauthorized") || message.includes("Invalid token")) return "Sua sessão expirou. Entre novamente para gerar o Pix.";
  if (message.includes("NOT_CONFIGURED") || message.includes("Missing Supabase environment")) return "O serviço de pagamentos ainda precisa ser configurado pelo responsável.";
  if (message.startsWith("ASAAS_401") || message.startsWith("ASAAS_403")) return "O Asaas recusou o acesso ao serviço de pagamentos. O responsável precisa verificar a integração.";
  if (message.startsWith("PIX_CREATE_STATUS_UNKNOWN")) return "Não foi possível confirmar a geração do Pix. Reabra o checkout em alguns minutos; a cobrança existente será verificada antes de gerar outra.";
  if (message.startsWith("PIX_QR_UNAVAILABLE")) return "A cobrança foi criada, mas o QR Code ainda não está disponível. Reabra o mesmo plano para recuperar o Pix, sem criar outra cobrança.";
  if (message.startsWith("ASAAS_")) {
    if (/invalid_cpfCnpj|invalid_cpf_cnpj|invalid_customer/i.test(message)) return "O Asaas não aceitou os dados do titular. Confira o nome civil e o CPF ou CNPJ.";
    if (/invalid_dueDate|invalid_due_date/i.test(message)) return "O Asaas recusou o vencimento da cobrança. O responsável precisa verificar a integração.";
    if (message.startsWith("ASAAS_429")) return "O Asaas recebeu muitas solicitações. Aguarde um pouco antes de tentar novamente.";
    return "O Asaas não concluiu o Pix. Tente novamente mais tarde; se persistir, contate o responsável pelo aplicativo.";
  }
  return "Não foi possível concluir o Pix com segurança. Tente novamente mais tarde ou contate o responsável pelo aplicativo.";
}