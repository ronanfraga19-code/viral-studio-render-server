# Viral Studio Render Server — Auto Pair

Além do renderizador, esta versão possui um registro temporário do Motor PC:

- `POST /motor/register` — heartbeat do computador
- `GET /motor/current/:pairId` — descoberta automática pelo celular

O registro expira rapidamente quando o computador é desligado. O Motor PC renova automaticamente enquanto estiver aberto.
