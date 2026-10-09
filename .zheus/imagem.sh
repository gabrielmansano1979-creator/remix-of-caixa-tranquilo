#!/bin/sh
# Compatibilidade: instruções antigas chamam ./.zheus/imagem.sh.
# O gerador de verdade é o imagem.cjs — este arquivo só repassa.
exec node "$(dirname "$0")/imagem.cjs" "$@"
