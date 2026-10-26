# Shlink

[Shlink](https://shlink.io/) es un acortador de URL autoalojado, de código
abierto (MIT), con una API REST. Esta integración lleva las visitas de sus
enlaces cortos a Gladys: el servidor Shlink se convierte en un dispositivo
(accesible o no, número de enlaces, visitas en total y de hoy, visitas de
robots de hoy), y cada enlace corto que usted elija se convierte en un
dispositivo con sus visitas en total, sus visitas de hoy y la fecha de su
última visita. Las escenas pueden reaccionar a cada nueva visita de un enlace
(con el país y el sitio de origen cuando Shlink los conoce), y a la caída o la
vuelta de Shlink; un widget del panel lista los enlaces más visitados, y una
acción de escena pone las cifras de un enlace en un mensaje.

Probada con un Shlink 5.1.8 autoalojado real (Docker, SQLite), con visitas
reales; sus comentarios son bienvenidos en
[las issues](https://github.com/guim31/gladys-shlink/issues).

## Lo que necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor Shlink (versión 3.0 o posterior, para la API REST v3), accesible
  desde la máquina de Gladys.
- Una **clave de API** de este servidor.

En cada actualización la integración envía cuatro peticiones (totales de
visitas, visitas del día con y sin robots, los diez enlaces más visitados),
más dos por enlace añadido a Gladys (tres cuando los robots activan escenas), y
vuelve a leer toda la lista de enlaces cada 10 minutos. Gladys acepta 300
estados por minuto: con el intervalo de 30 segundos, añada como máximo 40
enlaces a Gladys.

## Primeros pasos

### 1. Crear una clave de API

En el servidor Shlink, ejecute `shlink api-key:generate` (con Docker:
`docker exec -it <contenedor> shlink api-key:generate`) y copie la clave. Una
clave limitada a un dominio o a los enlaces de su autor (roles de Shlink)
también sirve: la integración solo ve entonces esos enlaces.

### 2. Configurar la integración

En Gladys, abra **Integraciones → Shlink → Configuración**:

- **Dirección de Shlink**: la dirección de su servidor, la que usan sus enlaces
  cortos, por ejemplo `http://192.168.1.10:8080` o `https://s.example.org`. Se
  entiende una dirección copiada con `/rest/...`.
- **Clave de API**: la clave del paso 1.
- **Intervalo de actualización**: de 30 segundos a 5 minutos (1 minuto por
  defecto).
- **Los robots activan «Nueva visita»**: desactivado por defecto. Shlink marca
  como robots los rastreadores y las vistas previas de enlaces (mensajería,
  redes sociales); las cifras nunca las cuentan.
- **Idioma de los nombres**: el idioma de los nombres de las funciones, fijados
  al añadir un dispositivo, y de los resultados de escena.

**Probar la conexión** lee Shlink y responde con la versión, el número de
enlaces y las visitas del día.

### 3. Añadir el servidor y los enlaces

Abra la pestaña **Descubrir** de la integración: lista el servidor Shlink y sus
enlaces cortos, los más visitados primero (los 200 primeros). Añada el
servidor, y los enlaces que quiera seguir: solo los enlaces añadidos se leen
uno a uno y activan «Nueva visita».

## Los dispositivos

El servidor Shlink:

| Función               | Lo que muestra                                                         |
| --------------------- | ---------------------------------------------------------------------- |
| Accesible             | 1 cuando Shlink responde, 0 tras dos lecturas fallidas seguidas        |
| Enlaces cortos        | los enlaces cortos que ve la clave de API                              |
| Visitas               | las visitas de todos los enlaces desde que Shlink cuenta, sin robots   |
| Visitas hoy           | las visitas de todos los enlaces hoy (desde la medianoche), sin robots |
| Visitas de robots hoy | las visitas de hoy que Shlink marca como robots                        |

Cada enlace corto añadido:

| Función       | Lo que muestra                                                                       |
| ------------- | ------------------------------------------------------------------------------------ |
| Visitas       | las visitas del enlace, sin robots                                                   |
| Visitas hoy   | las visitas del enlace hoy (desde la medianoche), sin robots                         |
| Última visita | la fecha y la hora locales de la última visita (sin robots), `-` antes de la primera |

El mismo código corto en dos dominios da dos enlaces distintos. «Hoy» empieza a
medianoche en la zona horaria de Gladys.

## Panel

El widget **Enlaces Shlink** muestra las visitas de hoy, las visitas en total y
el número de enlaces, y después los diez enlaces más visitados con sus visitas
(y las de hoy para los enlaces añadidos a Gladys). El botón **Actualizar**
vuelve a leer Shlink.

## Escenas

### Disparadores

- **Nueva visita**: se visita un enlace corto añadido a Gladys. Elija los
  enlaces (vacío: todos). Variables: nombre del enlace, dirección corta,
  dirección de destino, país y código de país (vacíos cuando Shlink no localiza
  las visitas), sitio de origen (solo su host, vacío si no hay), visitas hoy,
  robot (1) o no (0). Los robots solo lo activan con la opción de la
  configuración. Se anuncian hasta 20 visitas nuevas por enlace y
  actualización: las demás se cuentan, no se anuncian.
- **Shlink inaccesible**: Shlink ya no responde, tras dos lecturas fallidas
  seguidas (una clave de API rechazada no es una caída). Variable: dirección
  del servidor.
- **Shlink accesible de nuevo**: Shlink responde de nuevo. Variables: dirección
  del servidor, caída en minutos.

### Acciones

- **Leer un enlace corto**: lee las cifras de un enlace para las siguientes
  acciones: nombre, dirección corta, dirección de destino, visitas, visitas de
  hoy, última visita, y una frase lista como «Newsletter: 12 visita(s) hoy, 340
  en total, última visita 2026-10-26 17:05.».

### Ideas de escenas

- Una notificación cuando alguien abre el enlace de su CV o de un anuncio:
  disparador **Nueva visita** en ese enlace, y después un mensaje con el país y
  el sitio de origen.
- Cada noche a las 21 h, **Leer un enlace corto** en el enlace de su
  newsletter, y después enviar su frase por Telegram.
- Un aviso cuando su acortador se cae: disparador **Shlink inaccesible**,
  mensaje al administrador; y **Shlink accesible de nuevo** con la duración de
  la caída.

## Solución de problemas

- **«Shlink no responde»**: compruebe la dirección y que Gladys alcanza el
  servidor (misma red, cortafuegos, puerto).
- **«clave de API rechazada»**: la clave se ha borrado, desactivado o ha
  caducado: cree otra con `shlink api-key:generate`.
- **«no hay ninguna API de Shlink en esta dirección»**: la dirección lleva a
  otra cosa (un cliente web como app.shlink.io, una página de proxy inverso):
  use la dirección de los enlaces cortos.
- **«la dirección redirige»**: introduzca directamente la dirección `https://`.
- **«certificado rechazado»**: el certificado HTTPS es autofirmado o ha
  caducado: use la dirección `http://` en su red local, o un certificado
  reconocido.
- **Sin país en «Nueva visita»**: Shlink solo localiza las visitas con una
  clave de licencia GeoLite2 (`GEOLITE_LICENSE_KEY`).
- Los registros nunca dicen quién ha visitado: ni dirección, ni país, ni sitio
  de origen.

## Límites

- Solo Shlink (API REST v3, Shlink 3.0 o posterior); las visitas huérfanas
  (dirección base, enlaces no válidos) no se cuentan.
- Shlink fecha las visitas al segundo y no les da identificador: la integración
  anuncia cada visita nueva una vez recordando la más reciente vista, en
  `/data`. Tras una parada larga, solo se anuncian las 20 visitas más recientes
  de cada enlace.
- Un enlace solo se lee uno a uno una vez añadido a Gladys; toda la lista se
  vuelve a leer cada 10 minutos (un enlace nuevo aparece en Descubrir en 10
  minutos, o al instante con una búsqueda).
- La integración lee Shlink, no crea ni modifica ningún enlace.
