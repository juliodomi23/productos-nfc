FROM node:22-alpine
# tzdata + TZ: sin esto el contenedor corre en UTC y datetime('now','localtime')
# de SQLite devuelve UTC, no la hora de Tuxtla. La nómina saldría 6 h adelantada
# y una salida de 7 PM se guardaría con fecha del día siguiente.
RUN apk add --no-cache tzdata
ENV TZ=America/Mexico_City
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV DB_PATH=/data/nfc.db
EXPOSE 3040
CMD ["node", "server.js"]
