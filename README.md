# Reportes Laborales Inteligentes

Aplicación web responsive para registrar reportes de trabajo de varios empleados, con login multiusuario y persistencia real en SQLite.

## Que incluye este MVP

- Captura de reportes desde celular o computadora.
- Login multiusuario con roles (administrador y empleado).
- Dashboard ejecutivo con pendientes de cotizacion, facturacion y seguimiento.
- Deteccion de fallas recurrentes por cliente.
- API route interna para consultar y recalcular el analisis.
- Persistencia real en base de datos SQLite local (`data/reportes.db`).

## Rutas principales

- `/` resumen general del sistema.
- `/login` acceso de usuarios.
- `/reportes` formulario para capturar reportes del personal.
- `/dashboard` tablero con analisis consolidado.
- `/api/analyze` endpoint que entrega el resumen actual y acepta nuevos reportes por `POST`.

## Comandos

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

## Variables de entorno

Crea un archivo `.env.local` a partir de `.env.example`:

```bash
cp .env.example .env.local
```

Define una clave fuerte para sesión:

- `SESSION_SECRET`: cadena larga y aleatoria para firmar cookies de sesión.
- `REPORT_OWNER_EMAIL`: correo del propietario que puede cambiar estado de reportes.
- `SQLITE_DB_PATH` (opcional): ruta absoluta/relativa del archivo SQLite.

## Credenciales iniciales

Se crean automáticamente en el primer arranque (si la base está vacía):

- Administrador: `admin@reportes.local` / `Admin123!`

No se crean empleados de prueba. El administrador crea usuarios reales desde `/admin/usuarios`.

## Como funciona el analisis

El motor del MVP revisa el texto del reporte y las banderas seleccionadas para clasificar:

- trabajos pendientes de cotizacion
- servicios pendientes de facturacion
- seguimientos operativos por cerrar
- fallas recurrentes detectadas varias veces en el mismo cliente

## Persistencia

- La base SQLite se guarda en `data/reportes.db`.
- Usuarios y reportes permanecen entre reinicios del servidor.
- Si borras la base, el sistema solo recrea el usuario administrador inicial.

## Despliegue para colaboradores (Render)

Este proyecto ya incluye `render.yaml` para despliegue con disco persistente.

1. Sube este repo a GitHub.
2. En Render: **New + > Blueprint** y selecciona tu repo.
3. Render leerá `render.yaml` y creará el Web Service con disco `sqlite-data`.
4. En variables de entorno, confirma:
	- `SESSION_SECRET` (Render lo genera automáticamente)
	- `REPORT_OWNER_EMAIL` (ej. `admin@reportes.local`)
	- `SQLITE_DB_PATH=/var/data/reportes.db`
5. Despliega y comparte la URL pública HTTPS con tus colaboradores.

Notas:

- El endpoint de IA requiere un Ollama accesible por red (`OLLAMA_HOST`).
- Si no configuras Ollama en servidor, el resto del sistema (usuarios/reportes/dashboard) funciona normalmente.

## Automatizacion util

- `pnpm check:prod` valida la URL publica y el endpoint de Ollama configurado.
- `pnpm rotate:session-secret` rota `SESSION_SECRET` en Render usando su API.
- `pnpm sync:ollama -- --host <url> [--api-key <token>] [--model <modelo>]` sincroniza la conexion de Ollama en Render.
- `scripts/setup-ollama-vps.sh` deja Ollama instalado, escuchando en `0.0.0.0:11434` y con firewall abierto en un VPS Ubuntu.
- `scripts/setup-ollama-vps.ps1` ejecuta ese aprovisionamiento por SSH desde Windows para evitar pegar comandos en Hostinger.
- `scripts/harden-ollama-proxy.sh` protege Ollama con Nginx + Bearer token y cierra el puerto directo.
- `scripts/secure-ollama-stack.ps1` hace el hardening del VPS y sincroniza Render en un solo paso desde Windows.
- `.github/workflows/production-health.yml` corre un health check diario y abre/cierra un issue automaticamente.
- `.github/workflows/rotate-session-secret.yml` rota `SESSION_SECRET` cada mes si configuras `RENDER_API_KEY` como secreto de GitHub.
- `.github/workflows/harden-ollama-stack.yml` permite endurecer Ollama desde GitHub Actions si configuras `RENDER_API_KEY` y `VPS_SSH_KEY`.

## Instalar Ollama para Render (paso a paso)

Render no ejecuta Ollama dentro del mismo servicio web de este proyecto. El flujo recomendado es:

1. Instalar y proteger Ollama en un VPS Ubuntu (Hostinger, Contabo, etc.).
2. Conectar Render a ese endpoint externo por variables de entorno.

### Opcion recomendada (Windows, 1 comando)

Desde PowerShell en este proyecto:

```powershell
$env:RENDER_API_KEY="<tu_api_key_de_render>"
$env:RENDER_SERVICE_ID="srv-d6tg9i7diees73curoc0" # opcional si usas otro servicio
powershell -ExecutionPolicy Bypass -File .\scripts\secure-ollama-stack.ps1 -VpsHost "<IP_PUBLICA_VPS>" -User "root" -Model "llama3.2:latest"
```

Ese comando:

- instala/actualiza Ollama en el VPS,
- lo deja privado en `127.0.0.1:11434`,
- publica un proxy con token en `http://<VPS>:11435`,
- sincroniza `OLLAMA_HOST`, `OLLAMA_API_KEY` y `OLLAMA_MODEL` en Render.

### Opcion manual por pasos

- Instalar Ollama en VPS: `scripts/setup-ollama-vps.ps1`.
- Aplicar hardening/token: `scripts/harden-ollama-proxy.sh`.
- Sincronizar Render: `pnpm sync:ollama -- --host <url> --api-key <token> --model <modelo>`.

### Verificacion final

```bash
APP_URL=https://reportes-laborales-inteligentes.onrender.com \
OLLAMA_HOST=http://<IP_PUBLICA_VPS>:11435 \
OLLAMA_API_KEY=<token> \
pnpm check:prod
```

Si el check responde `OK ollama-tags`, Render ya puede usar Ollama en produccion.

### Secretos recomendados en GitHub

- `RENDER_API_KEY`: API key de Render para cambiar variables automaticamente.
- `VPS_SSH_KEY`: llave privada SSH del VPS para el workflow de hardening.
- `OLLAMA_API_KEY`: token Bearer del proxy de Ollama para el workflow `production-health.yml`.
