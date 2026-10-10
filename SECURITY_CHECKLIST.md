# Checklist de Seguridad

## Estado actual

- Backend Node con persistencia local en data/server-data.json.
- API protegida con autenticacion basica; el servidor no inicia sin una clave propia en .env.
- El servidor publica solo index.html, sistema.html, sistema-app.js y demo.html; el codigo, .env y data/ no son accesibles por navegador.
- CORS restringido a localhost y 127.0.0.1.
- Credenciales ZOOM guardadas solo en sessionStorage en la interfaz principal.
- Datos del envio ya no se mandan en la URL de ZOOM.RED.
- Render principal sanitizado para reducir XSS reflejado/almacenado.

## Verificaciones basicas

- Confirmar que el servicio se use solo en red local o equipo local.
- Confirmar que no se exponga el puerto 3000 a Internet sin proxy y autenticacion.
- Confirmar que data/ y .env no se suban a repositorios publicos (ya excluidos en .gitignore).
- Confirmar que no se almacenen contrasenas reales en archivos .md, .env.example o capturas.

## Antes de usar en produccion

- Agregar autenticacion real por usuario.
- Mover secretos a variables de entorno seguras.
- Forzar HTTPS detras de proxy reverso.
- Implementar control de sesiones y expiracion.
- Agregar autorizacion por roles si habra varios operadores.
- Registrar auditoria de altas, ediciones, exportaciones y sincronizaciones.
- Cifrar backups y restringir permisos de archivos locales.
- Validar tamano, tipo y formato de todos los campos de entrada.
- Agregar limite de peticiones y proteccion CSRF si se publica por navegador.
- Hacer backup periodico de data/server-data.json.

## Riesgos residuales

- Solo hay un usuario compartido (autenticacion basica), sin roles.
- La persistencia es local por archivo, no multiusuario.
- Sigue existiendo HTML inline en sistema.html, aunque la fuente de verdad ya esta definida.
- Cualquier despliegue fuera de localhost requiere endurecimiento adicional.
