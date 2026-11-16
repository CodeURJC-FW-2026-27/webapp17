# Sakura Buffet · Práctica 2

## Requisitos

- Node.js 22.21.0 o posterior.
- MongoDB Community Server. El proyecto se ha probado con MongoDB 8.2.1.

## Arrancar la web

1. Abre una terminal de PowerShell en la carpeta `practica2` del repositorio. La primera vez, instala las dependencias.

   ```powershell
   npm.cmd install
   ```

2. Si MongoDB todavía no está en marcha, arráncalo en una terminal y déjala abierta. Si Compass ya conecta a `localhost:27017`, pasa al siguiente paso.

   ```powershell
   npm.cmd run db
   ```

3. En otra terminal, dentro de `practica2`, arranca la web.

   ```powershell
   npm.cmd start
   ```

4. Abre [http://localhost:3000](http://localhost:3000). Si la base de datos está vacía, la aplicación carga los platos e ingredientes de ejemplo al arrancar. Para detener el servidor de la web, pulsa **Ctrl+C** en su terminal.
