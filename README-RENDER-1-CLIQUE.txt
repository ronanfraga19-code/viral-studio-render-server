Viral Studio Motor Cloud V8.4 — Finalização Fix

Corrige ciclo 100% -> erro -> fila. Se a voz neural falhar no fechamento, preserva o vídeo visual pronto em vez de descartar toda a renderização. Também valida o MP4 com ffprobe antes de marcar 100%.

Substitua os arquivos no GitHub e aguarde o Auto Deploy. Confirme /health com version 8.4.
