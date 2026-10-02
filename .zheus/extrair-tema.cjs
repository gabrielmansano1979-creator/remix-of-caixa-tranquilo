#!/usr/bin/env node
// CrieFy Skill UI: extrai cores, tipografia, estilos e tokens de design de uma URL.
//   node .zheus/extrair-tema.cjs "https://site-referencia.com"
const http = require('http');
const [targetUrl] = process.argv.slice(2);
if (!targetUrl) {
  console.error("uso: extrair-tema.cjs <url>");
  process.exit(1);
}
const corpo = Buffer.from(JSON.stringify({ url: targetUrl }));
const req = http.request("http://127.0.0.1:3333/api/projects/d8dfa074-b67b-48a7-b2a1-d117b5436ebf/extrair-tema", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": corpo.length,
    "X-Zheus-Imagem": "86fceee0613a0072b31d1b68614883892ce3c2d3d33e4cb6",
  },
}, (res) => {
  let dados = "";
  res.setEncoding("utf8");
  res.on("data", (p) => { dados += p; });
  res.on("end", () => {
    process.stdout.write(dados);
    if (!(res.statusCode >= 200 && res.statusCode < 300)) process.exitCode = 1;
  });
});
req.on("error", (e) => { console.error("falhou: " + e.message); process.exit(1); });
req.end(corpo);
