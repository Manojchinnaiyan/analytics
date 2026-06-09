dev:
	docker compose -f infra/docker-compose.yml up -d
	@echo "Infrastructure started"

stop:
	docker compose -f infra/docker-compose.yml down

ingestion:
	cd apps/ingestion && go run ./cmd/main.go

query:
	cd apps/query && go run ./cmd/main.go

worker:
	cd apps/worker && go run ./cmd/main.go

dashboard:
	cd dashboard && pnpm dev

sdk-build:
	cd packages/sdk-browser && pnpm build
	cd packages/sdk-node && pnpm build

migrate:
	./infra/clickhouse/migrate.sh

lint:
	cd apps/ingestion && golangci-lint run
	cd apps/query && golangci-lint run
	cd apps/worker && golangci-lint run

test:
	cd apps/ingestion && go test ./...
	cd apps/query && go test ./...
	cd apps/worker && go test ./...

.PHONY: dev stop ingestion query worker dashboard sdk-build migrate lint test
