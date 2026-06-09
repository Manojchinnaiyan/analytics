# Deploy to a Contabo (or any amd64) VPS

Single-box deploy: the whole stack runs via `docker-compose.prod.yml`, behind
Caddy (auto-HTTPS). Only ports **80/443** are public; ClickHouse/Postgres/Redis/
Kafka are reachable only inside the Docker network.

## 0. Sizing
Comfortable on a **Contabo VPS with ≥8 GB RAM** (ClickHouse + Kafka are the
heavy parts). 4 GB works but is tight — bump `vm.max_map_count` and watch CH RAM.

## 1. DNS
Create three A-records pointing at the server's public IP:
```
app.example.com      → <server-ip>
api.example.com      → <server-ip>
ingest.example.com   → <server-ip>
```

## 2. Server prep (Ubuntu)
```bash
curl -fsSL https://get.docker.com | sh           # Docker + compose plugin
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```
(Do NOT open 5432/9000/9092/6379 — they must stay private.)

## 3. Get the code + configure
```bash
git clone <your-repo> inspectuser && cd inspectuser/infra
cp .env.prod.example .env
nano .env        # set domains, PUBLIC_* urls, and STRONG secrets
# generate secrets: openssl rand -hex 32
```

## 4. Deploy
```bash
chmod +x deploy.sh && ./deploy.sh
```
First run builds images (a few minutes) and Caddy provisions TLS certs
automatically once DNS resolves.

## 5. Verify
```bash
curl https://api.example.com/health           # {"status":"ok"}
# open https://app.example.com  → sign up
```

## Updating after code changes
```bash
git pull && cd infra && ./deploy.sh
```

## Operations
- Logs:        `docker compose -f docker-compose.prod.yml logs -f query`
- DB shell:    `docker compose -f docker-compose.prod.yml exec postgres psql -U amplitude`
- Admin tools (Kafka UI / ClickHouse) are NOT exposed — reach them via SSH tunnel:
  `ssh -L 8123:localhost:8123 user@server` then `docker compose ... exec clickhouse ...`.

## Gotchas
- **NEXT_PUBLIC_* is baked at build time** — if you change a `PUBLIC_*` URL in
  `.env`, you must rebuild the dashboard (`./deploy.sh` does this).
- **Kafka after an unclean reboot** can crash-loop on a stale Zookeeper znode.
  Fix: `docker compose -f docker-compose.prod.yml restart zookeeper kafka`, then
  `restart ingestion worker`.
- **Backups**: snapshot the named volumes `clickhouse_data` and `postgres_data`
  (e.g. `docker run --rm -v infra_postgres_data:/v -v $PWD:/b alpine tar czf /b/pg.tgz /v`).
- The SDK on a customer site points at `https://ingest.example.com` (set
  `serverUrl` in `init()`); the dashboard talks to `https://api.example.com`.
