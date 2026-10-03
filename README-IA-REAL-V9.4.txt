Viral Studio Cloud V9.4 — Upload Only
Rotas principais do PRO Anual:
GET  /ai-real/status
POST /ai-real/analyze-images
POST /ai-real/jobs
GET  /ai-real/jobs/:id
GET  /ai-real/jobs/:id/file
GET  /ai-real/jobs/:id/file?download=1
GET  /ai-real/download/:id

Melhorias:
- Studio usa somente upload de vídeo de referência; link TikTok removido do fluxo PRO.
- Validação de POLLINATIONS_API_KEY mais compatível, sem aceitar placeholders.
- /ai-real/jobs falha imediatamente se a IA não estiver configurada.
- MP4 suporta Range (206) para player do Safari/iPhone.
- Download MP4 com Content-Disposition attachment.
- O vídeo original não é reutilizado na saída.
