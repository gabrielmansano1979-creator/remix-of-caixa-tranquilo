import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Resend } from "resend";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const [recipient, ...extraArgs] = process.argv.slice(2);
if (
  extraArgs.length > 0 ||
  !recipient ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
) {
  console.error("Uso: npm run test:email -- destinatario@exemplo.com");
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY?.trim();
if (!apiKey) {
  console.error("RESEND_API_KEY não está configurada no ambiente ou no arquivo .env.");
  process.exit(1);
}

const sender = process.env.RESEND_FROM_EMAIL?.trim();
if (!sender) {
  console.error("RESEND_FROM_EMAIL não está configurada. Informe um remetente verificado no Resend.");
  process.exit(1);
}

const resend = new Resend(apiKey);
try {
  const { data, error } = await resend.emails.send({
    from: `Critical Cash <${sender}>`,
    to: [recipient],
    subject: "Teste de envio de e-mail",
    html: "<p>Este é um e-mail de teste do envio transacional do Critical Cash.</p>",
    text: "Este é um e-mail de teste do envio transacional do Critical Cash.",
  });

  if (error) {
    console.error(`Falha no envio pelo Resend: ${error.message}`);
    process.exit(1);
  }

  console.log(`E-mail de teste enviado. Identificador: ${data?.id ?? "indisponível"}`);
} catch (error) {
  console.error(
    `Falha ao conectar ao Resend: ${error instanceof Error ? error.message : "erro inesperado"}`,
  );
  process.exit(1);
}
