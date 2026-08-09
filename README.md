# Mann

Mann is a browser navigation simulation. The frontend requests real driving geometry from the backend, which normalizes a public OSRM response before the existing simulation engine advances along the road coordinates.

## Development

From `~/projectsinc/mann`:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
npm run dev
```

Open `http://localhost:5173` (or the Vite port printed in the terminal). From another computer on the LAN, use `http://<server-lan-ip>:5173`.

The backend listens on port `3001` and can be configured with `PORT`, `HOST`, and `OSRM_BASE_URL`. The frontend's `/api` requests are proxied to it by Vite, so no server IP is embedded in browser code.

## Production-style validation

```bash
npm run build
npm run start:backend
npm --prefix frontend run preview -- --host 0.0.0.0
```

A direct health check is available at `http://localhost:3001/health`.
