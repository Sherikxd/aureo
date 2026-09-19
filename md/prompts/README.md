# Prompts para contribuir con IA

Esta carpeta contiene prompts reutilizables para trabajar en Áureo con un
asistente de IA. Están pensados para complementar la documentación del
proyecto, no para reemplazar la revisión humana, las pruebas ni las reglas de
seguridad.

## Cómo usarlos

1. Comparte con el asistente el prompt elegido.
2. Añade el issue, los archivos relevantes y el comportamiento esperado.
3. Pide que inspeccione el código existente antes de editar.
4. Revisa el diff y ejecuta las pruebas indicadas por el proyecto.

No incluyas claves privadas, tokens, archivos `.env`, datos personales ni
información confidencial en el contexto del asistente.

## Prompt de exploración

```text
Actúa como mantenedor de Áureo. Investiga esta tarea: [DESCRIBE LA TAREA].
Antes de proponer cambios, revisa la arquitectura, los scripts relacionados,
las pruebas existentes y la documentación. Identifica los archivos que
participan en el flujo, las dependencias entre ellos y cualquier riesgo de
regresión. Devuelve un resumen con evidencia (archivos y líneas), una propuesta
acotada y los comandos de validación. No edites todavía.
```

## Prompt de implementación

```text
Implementa esta tarea en Áureo: [DESCRIBE LA TAREA].
Sigue los patrones existentes y realiza cambios quirúrgicos. Lee primero el
código y la documentación relacionada; no inventes APIs si ya existe un helper.
Mantén la seguridad de claves y roles, muestra los errores explícitamente y
actualiza la documentación directamente afectada. Añade o ajusta pruebas para
el comportamiento solicitado. Al terminar, resume los archivos modificados y
ejecuta las pruebas mínimas relevantes.
```

## Prompt de revisión

```text
Revisa este cambio de Áureo como un mantenedor: [PEGA EL DIFF O DESCRIBE EL
CAMBIO]. Busca errores funcionales, regresiones, problemas de autorización,
manejo inseguro de claves, inconsistencias entre scripts y documentación, y
pruebas insuficientes. Prioriza hallazgos verificables y especifica archivo,
líneas, impacto y corrección recomendada. Si no encuentras problemas,
indícalo junto con las limitaciones de la revisión. No modifiques archivos.
```

## Prompt de documentación

```text
Actualiza la documentación de Áureo para este cambio: [DESCRIBE EL CAMBIO].
Localiza todas las guías afectadas, conserva el idioma y el estilo existentes,
explica el comportamiento predeterminado y los casos alternativos, y añade
ejemplos ejecutables cuando sean útiles. No documentes secretos reales.
Comprueba enlaces, nombres de comandos y variables de entorno; termina con una
verificación de formato.
```

## Criterios para aceptar una contribución

- El cambio resuelve el problema descrito sin alterar funcionalidades no
  relacionadas.
- La implementación respeta roles, validaciones, manejo de errores y secretos.
- Las pruebas cubren el comportamiento nuevo o actualizado.
- La documentación explica configuración, límites y comandos afectados.
- El diff es pequeño, legible y revisable.
