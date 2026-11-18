# Documentación de OnBoard Pro

| Carpeta | Qué contiene |
|---|---|
| `general/` | Documento final del proyecto, presentación e informe general de avance (indicadores, gráficas y bitácora de defectos). |
| `general/adjuntos/` | Anexos del documento final: Sprint Review (B1–B11) e informes de pruebas unitarias (C1–C11). |
| `general/diagramas/` | Diagramas del documento final (casos de uso, clases, secuencia, arquitectura, despliegue, modelo de datos y aislamiento), en PNG y en su fuente Mermaid (`.mmd`). |
| `general/imagenes/` | Gráficas de velocidad, burn-up y defectos del informe general. |
| `general/investigacion-fuentes.md` | Notas de investigación con las fuentes de las cifras del documento final (salario mínimo, mercado, rotación, competidores y precios, marco legal). Sirve para responder de dónde sale cada dato. |
| `sprints/` | Sprint Review de cada sprint (SP1–SP11). |
| `pruebas/` | Informe de pruebas unitarias de cada sprint y, en `integracion/`, los resultados de las pruebas contra la base real (`node scripts/pruebas-integracion.js`). |
| `tecnico/` | Backlog con todas las historias de usuario (exportado de Jira) y `openapi.json`, el contrato de la API (`npm run docs`). |
