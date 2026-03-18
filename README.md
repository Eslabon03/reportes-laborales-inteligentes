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
