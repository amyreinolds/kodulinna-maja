# Majutus konteinerina — töötab Fly.io, Railway, Koyeb ja mujal.
# Renderis seda ei ole vaja (vt render.yaml), aga ta hoiab valikud lahti.
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Kõigepealt ainult sõltuvused: nii ei pea neid iga koodimuudatuse
# järel uuesti tõmbama.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
