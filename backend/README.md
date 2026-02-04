# Inventory Backend (FastAPI)

## Setup
1. Create virtual environment: `python -m venv .venv`
2. Activate env (PowerShell): `.venv\\Scripts\\Activate.ps1`
3. Install dependencies: `pip install -e .[dev]`
4. Copy env template: `cp .env.example .env` (adjust secrets)

## Run
`uvicorn app.main:app --reload`

On first start the admin user defined in environment will be created automatically.
