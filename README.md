# Generador de Tablas para Latex/Overleaf

Herramienta web para generar código LaTeX de tablas compatible con el `\newcommand{\tabla}` personalizado. Diseñada para usarse junto a una instalación de [Overleaf](https://overleaf.com) (Community Edition vía `overleaf-toolkit`), aunque funciona de forma completamente independiente como fichero HTML estático.

![dark mode UI](https://img.shields.io/badge/UI-dark%20mode-1e1e1a?style=flat-square) ![LaTeX](https://img.shields.io/badge/LaTeX-xcolor%20%7C%20longtable-78b4e0?style=flat-square) ![deploy](https://img.shields.io/badge/deploy-Docker%20%2B%20Nginx-7ec87e?style=flat-square)



# Características

- **Edición de tabla inline** — celdas editables con navegación por teclado (Tab, Enter, flechas)
- **Importación desde Excel / CSV** — pega datos copiados directamente desde Excel o cualquier CSV con separador por tabulador, punto y coma o coma
- **Gestión de filas y columnas** — añadir, eliminar, resetear o limpiar con un clic
- **Diseño de columnas** — alineación (izquierda, centro, derecha, párrafo), bordes verticales y horizontales, especificación manual de col spec
- **Cabecera con color** — selector de color de fondo y de texto con paleta completa de colores `xcolor` (base + `dvipsnames`), con previsualización en tiempo real en el grid
- **Sintaxis resaltada** — el panel derecho muestra el código `\tabla{}{}{}{}`  con colores por argumento
- **Copiar Macro** — copia al portapapeles el `\newcommand{\tabla}` completo listo para pegar en el preámbulo
- **Copiar Tabla** — copia el código `\tabla{...}` de la tabla actual



## El comando `\tabla`

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

El botón **Copiar Macro** copia este `\newcommand` completo para que los puedas incluir en tu preámbulo. También necesitarás los paquetes `longtable`, `xcolor` (con la opción `dvipsnames`) y `colortbl` en tu preámbulo:

```latex
\usepackage{longtable}
\usepackage[dvipsnames]{xcolor}
\usepackage{colortbl}
```

# Uso de la herramienta

## Navegador web

Al ser un único fichero `.html` sin dependencias externas (salvo Google Fonts), también puedes abrirlo directamente en el navegador.

## Despliegue con Docker

La herramienta se sirve como un fichero HTML estático mediante un contenedor Nginx independiente, sin interferir con `overleaf-toolkit`.

### Estructura de ficheros

```
tools/
├── docker-compose.yml
├── nginx.conf
└── html/
    └── TableGenerator.html
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
      - ./html:/usr/share/nginx/html:ro
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
```

### Arrancar el contenedor Docker

```bash
cd tools/
docker compose up -d
```

La herramienta queda disponible en `http://IP DEL SERVIDOR:8080/TableGenerator.html`.



## Tecnologías

- HTML5 / CSS3 / JavaScript vanilla — sin frameworks ni dependencias de build
- Fuentes: [DM Mono](https://fonts.google.com/specimen/DM+Mono) + [Fraunces](https://fonts.google.com/specimen/Fraunces) vía Google Fonts
- Despliegue: [Nginx Alpine](https://hub.docker.com/_/nginx) en Docker
