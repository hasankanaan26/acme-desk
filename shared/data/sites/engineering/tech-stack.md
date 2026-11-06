# Acme Corp — Technology Stack

## Backend

- **Language**: Python 3.12
- **Web Framework**: FastAPI
- **Task Queue**: Celery with Redis as the broker
- **Database**: PostgreSQL 16 for primary data storage
- **Cache**: Redis for caching and session storage
- **Search**: Elasticsearch for full-text search features

## Frontend

- **Framework**: React 18 with TypeScript
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Build Tool**: Vite

## Infrastructure

- **Cloud Provider**: AWS (us-east-1 primary, eu-west-1 secondary)
- **Container Orchestration**: Kubernetes (EKS)
- **CI/CD**: GitHub Actions for all pipelines
- **Monitoring**: Datadog for metrics, logs, and traces
- **Error Tracking**: Sentry

## Development Tools

- **Version Control**: GitHub (github.com/acmecorp)
- **Package Management**: pip with requirements.txt (migrating to uv)
- **Linting**: Ruff for Python linting and formatting
- **Testing**: pytest for backend, Vitest for frontend
- **Local Development**: Docker Compose for running the full stack locally

## Data and AI

- **LLM Provider**: OpenAI API (GPT-4o-mini for most tasks, GPT-4o for complex reasoning)
- **Embeddings**: OpenAI text-embedding-3-small
- **Vector Store**: ChromaDB (evaluating Pinecone for production)
- **ML Experiments**: MLflow for experiment tracking

## Key Constraints

- All services must support horizontal scaling.
- No vendor lock-in for core business logic — keep provider-specific code in adapters.
- All data in transit must use TLS. All data at rest must be encrypted.
- New technology choices must be approved through an ADR before adoption.
