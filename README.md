# Generador de Tablas para Latex/Overleaf

Herramienta web para generar código LaTeX de tablas compatible con el `\newcommand{\tabla}` personalizado. Diseñada para usarse junto a una instalación de [Overleaf](https://overleaf.com) (Community Edition vía `overleaf-toolkit`), aunque funciona de forma completamente independiente como fichero HTML estático.

![dark mode UI](https://img.shields.io/badge/UI-dark%20mode-1e1e1a?style=flat-square) ![LaTeX](https://img.shields.io/badge/LaTeX-xcolor%20%7C%20longtable-78b4e0?style=flat-square) ![deploy](https://img.shields.io/badge/deploy-Docker%20%2B%20Nginx-7ec87e?style=flat-square)



# Características

- **Edición de tabla inline** — celdas editables con navegación por teclado (Tab, Enter, flechas)
- **Importación versátil** — pega datos copiados de Excel/CSV (separador tabulador, `;` o `,`) o código LaTeX y la herramienta lo parsea automáticamente para editarlo visualmente:
  - `\tabla{...}{...}{...}{...}` — round-trip completo (colores con opacidad, negrita, `\multicolumn`/`\multirow`, `\rowcolor`, `\hline`)
  - `\begin{tabular}{...}…\end{tabular}` y `\begin{longtable}{...}…\end{longtable}` — primera fila como cabecera
- **Gestión de filas y columnas** — añadir, eliminar, resetear o limpiar con un clic
- **Combinar / dividir celdas** — selecciona un rango arrastrando (estilo Excel) y combina horizontal, verticalmente o ambas a la vez; genera `\multicolumn` y `\multirow` automáticamente
- **Diseño de columnas** — alineación (izquierda, centro, derecha, párrafo), bordes verticales y horizontales, especificación manual de col spec
- **Colores con opacidad** — paleta completa `xcolor` (base + 68 `dvipsnames`) tanto en la cabecera como en celdas seleccionadas, con control de opacidad `5–100%` en cada selector que se traduce a la sintaxis `color!xx` de xcolor; vista previa en tiempo real sobre el grid
- **Color de celdas seleccionadas** — selecciona un rango y aplica un color de fondo y texto independiente a esas celdas, anulando el color de cabecera o de filas alternas
- **Filas alternas (zebra)** — color alternativo automático para filas pares/impares mediante `\rowcolor{...}`. Los colores per-cell siguen prevaleciendo (comportamiento estándar de `colortbl`)
- **Interfaz de pestañas estilo Word** — controles organizados en 5 pestañas (Tabla, Columnas, Cabecera, Color celdas, Filas alternas) para evitar saturación visual
- **Salida con sintaxis resaltada** — panel plegable en el footer con el código `\tabla{}{}{}{}` coloreado por argumento (#1 nº cols, #2 col spec, #3 cabecera, #4 contenido)
- **Copiar Macro** — copia al portapapeles el `\newcommand{\tabla}` completo listo para pegar en el preámbulo
- **Copiar Tabla** — copia el código `\tabla{...}` de la tabla actual



# Cómo ejecutarlo

## Ejecutar el HTML directamente

La aplicación es HTML + CSS + JS vanilla sin dependencias externas (salvo Google Fonts). Puedes abrir `webapp/TableGenerator.html` directamente en el navegador; los ficheros CSS y JS se cargan desde las subcarpetas `css/` y `js/` mediante rutas relativas.

```bash
open webapp/TableGenerator.html
```

No requiere build, servidor ni instalación de paquetes.

## Despliegue con Docker

La herramienta se sirve como un fichero HTML estático mediante un contenedor Nginx independiente, sin interferir con `overleaf-toolkit`.

### Estructura de ficheros

```
tools/
├── docker-compose.yml
├── nginx.conf
└── webapp/
    ├── TableGenerator.html
    ├── css/
    │   └── styles.css
    └── js/
        └── app.js
```

### Fichero `nginx.conf`

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index TableGenerator.html;

    location / {
        try_files $uri $uri/ =404;
    }

    location ~* \.(html|css|js|svg)$ {
        expires 1h;
        add_header Cache-Control "public";
    }
}
```

### Fichero `docker-compose.yml`

```yaml
services:
  tools-web:
    image: nginx:alpine
    restart: always
    ports:
      - "8080:80"
    volumes:
      - ./webapp:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

### Arrancar el contenedor Docker

```bash
cd tools/
docker compose up -d
```

La herramienta queda disponible en `http://IP DEL SERVIDOR:9999`. Se puede redefinir el puerto modificando el fichero `docker-compose.yml`.



# El comando `\tabla`

La herramienta genera código para el siguiente `\newcommand`, que deberás tener definido en el preámbulo de tu documento LaTeX:

```latex
\newcommand{\tabla}[4]{
\begin{center}
    \begin{longtable}{#2}
        \hline
        #3 % Contenido de la primera fila de la tabla
        \\\hline\endfirsthead % Terminar Primera fila de tabla
        \multicolumn{#1}{|l|}{{\small\sl\tablaPreviousPage}}\\\hline
        #3\\\endhead
        \multicolumn{#1}{|r|}{{\small\sl\tablaNextPage}}\\
        \endfoot
        \endlastfoot
        #4
    \end{longtable}
\end{center}
}
```
| Argumento | Descripción |
|--|-|
| `#1` | Número de columnas |
| `#2` | Col spec (ej. `\|l\|c\|r\|`) |
| `#3` | Fila de cabecera con `\cellcolor` y `\textcolor` |
| `#4` | Contenido del cuerpo de la tabla |

El botón **Copiar Macro** copia este `\newcommand` completo para que los puedas incluir en tu preámbulo. También necesitarás los paquetes `longtable`, `xcolor` (con la opción `dvipsnames`), `colortbl` y `multirow` (este último requerido si usas combinaciones verticales de celdas) en tu preámbulo:

```latex
\usepackage{longtable}
\usepackage[dvipsnames]{xcolor}
\usepackage{colortbl}
\usepackage{multirow}
```



# Tecnologías

- HTML5 / CSS3 / JavaScript vanilla — sin frameworks ni dependencias de build
- Fuentes: [DM Mono](https://fonts.google.com/specimen/DM+Mono) + [Fraunces](https://fonts.google.com/specimen/Fraunces) vía Google Fonts
- Despliegue: [Nginx Alpine](https://hub.docker.com/_/nginx) en Docker
