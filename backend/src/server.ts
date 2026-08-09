import { createServer } from 'node:http';
import { handleRoutingRequest } from './routes/routing.routes.js';
const port = Number(process.env.PORT ?? 3001); const host = process.env.HOST ?? '0.0.0.0';
const server = createServer(async (request, response) => {
    response.setHeader('access-control-allow-origin', '*'); response.setHeader('access-control-allow-methods', 'GET, OPTIONS'); response.setHeader('access-control-allow-headers', 'content-type');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const requestUrl = new URL(request.url ?? '/', 'http://' + (request.headers.host ?? 'localhost'));
    if (requestUrl.pathname === '/health') { response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }); response.end(JSON.stringify({ status: 'ok', service: 'mann-backend' })); return; }
    await handleRoutingRequest(request, response, requestUrl);
});
server.listen(port, host, () => { console.log('Mann backend listening on http://' + host + ':' + port); console.log('OSRM base URL: ' + (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org')); });
