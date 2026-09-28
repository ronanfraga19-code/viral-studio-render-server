# Viral Studio Render Server
Servidor simples para renderização do Viral Studio com FFmpeg.

## API
- `GET /health` — teste de saúde
- `POST /render` — multipart/form-data, envie os trechos na ordem desejada usando o campo `clips`.

O retorno de `/render` é um MP4 pronto para download.
