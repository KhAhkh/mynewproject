# Backend Deployment + Mobile Public URL

This project supports two ways to access the backend from the mobile app:

1) **Hosted backend (free tiers)**
2) **Local backend with a public tunnel**

---

## 1) Hosted backend (Render)

The repo includes a ready Render config file: `render.yaml`.

**High‑level steps**
- Create a free Render account.
- Create a new **Web Service** from this repo.
- Render will detect and use `render.yaml` automatically.
- After deploy, copy the public URL (e.g., `https://your-service.onrender.com`).

---

## 2) Hosted backend (Railway)

The repo includes a ready Railway config file: `railway.json`.

**High‑level steps**
- Create a free Railway account.
- Create a new project from this repo.
- Railway will use `railway.json` for build and start commands.
- After deploy, copy the public URL (e.g., `https://your-app.up.railway.app`).

---

## 3) Local backend with a public tunnel

If you want to keep running the backend locally but still access it from mobile over the internet, use a tunnel.

**Cloudflare Tunnel (recommended)**
- Install `cloudflared`.
- Run a quick tunnel to your local backend on port 4000.
- The tunnel will give you a public HTTPS URL.

**ngrok (alternative)**
- Install ngrok.
- Start a tunnel to `http://localhost:4000`.
- Use the HTTPS URL provided by ngrok.

---

## Mobile app: set the backend URL

You can point the mobile app to the public URL in two ways:

### A) Runtime (no rebuild)
Open the **Settings** screen in the mobile app and set the server URL to your public address.

### B) Default env (requires Metro restart, rebuild for production)
Set the public URL in `mobile/.env`:

```
EXPO_PUBLIC_SERVER_URL=https://your-public-backend-url
```

Then restart Metro. For standalone builds, rebuild to bake in the new value.
