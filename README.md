# VyOS Fabric

A full-stack network operations console for managing VyOS routers at scale. Built by Quartz Systems.

## Architecture

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 |
| Backend | Rust · Axum · sqlx |
| Database | PostgreSQL 15+ |

The frontend runs on port **3000**, the backend API on port **3001**.

```
vyos-fabric/
├── frontend/   # Next.js application
└── backend/    # Rust/Axum REST API
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable, 1.75+)
- [PostgreSQL](https://www.postgresql.org/) 15+

---

## Development

### 1. Database

Create the database in PostgreSQL before starting the backend:

```sql
CREATE DATABASE vyos_fabric;
```

### 2. Backend

**Configure environment**

Copy the example env file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and set each variable:

```env
# Host or IP address of your PostgreSQL server
POSTGRES_HOST=localhost

# PostgreSQL port (default: 5432)
POSTGRES_PORT=5432

# Name of the database created in step 1
POSTGRES_DB=vyos_fabric

# PostgreSQL username
POSTGRES_USER=postgres

# PostgreSQL password for the user above
POSTGRES_PASSWORD=changeme
```

**Run the backend**

```bash
cd backend
cargo run
```

On first start, sqlx automatically runs all pending migrations and seeds default system config data. The API will be available at `http://localhost:3001`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:3000`.

