import { createServer } from 'node:http';
import { handleRoutingRequest } from './routes/routing.routes.js';
import { handleGeocodingRequest } from './routes/geocoding.routes.js';
import { handleWeatherRequest } from './routes/weather.routes.js';
import { handleRadioRequest } from './routes/radio.routes.js';
import { handleRoadsRequest } from './routes/roads.routes.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '0.0.0.0';
const server = createServer(async (request, response) => {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  const url = new URL(request.url ?? '/', 'http://' + (request.headers.host ?? 'localhost'));
  if (url.pathname === '/health' || url.pathname === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, service: 'mann-backend' }));
    return;
  }
  if (await handleGeocodingRequest(request, response, url)) return;
  if (await handleWeatherRequest(request, response, url)) return;
  if (await handleRadioRequest(request, response, url)) return;
  if (await handleRoadsRequest(request, response, url)) return;
  await handleRoutingRequest(request, response, url);
});
server.listen(port, host, () => {
  console.log('Mann backend listening on http://' + host + ':' + port);
  console.log('OSRM base URL: ' + (process.env.OSRM_BASE_URLS ?? process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org'));
});
