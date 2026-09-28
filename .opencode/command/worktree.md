---
description: Crea un git worktree local en .worktrees/ derivando el nombre del argumento
---

Tu única tarea es crear un git worktree a nivel local. No hagas absolutamente nada más.

1. Analiza el argumento recibido y deriva el nombre del worktree:
   $ARGUMENTS

   Regla de nombres: convierte el argumento en un nombre de rama válido de git
   en minúsculas, sin espacios (espacios -> guiones), sin caracteres especiales ni acentos.
   Por ejemplo "Build the Shield" -> "build-the-shield".

2. Ejecuta únicamente este comando:
   git worktree add .worktrees/<nombre>

   donde <nombre> es el resultado del análisis anterior.

Reglas estrictas:
- No hagas cd ni cambies de directorio.
- No ejecutes ningún otro comando (ni git status, ni git branch, ni checkout, ni commit).
- El único comando a ejecutar es el de creación del worktree.
- Reporta brevemente el nombre del worktree creado y su ruta.
- Si el argumento fuera muy largo, simplificalo pero mantén el sentido original
