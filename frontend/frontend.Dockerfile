# ETAP 1: Budowanie aplikacji React
# Używamy Node 22, ponieważ najnowszy Vite i Tailwind v4 wymagają wersji >= 20
FROM node:22-alpine AS build

WORKDIR /app

# Kopiujemy pliki konfiguracyjne npm
COPY package*.json ./

# Instalujemy zależności
RUN npm install

# Kopiujemy resztę plików źródłowych i budujemy wersję produkcyjną
COPY . .
RUN npm run build

# ETAP 2: Serwowanie plików przez Nginx (Lekki serwer produkcyjny)
FROM nginx:stable-alpine

# Kopiujemy zbudowane pliki z poprzedniego etapu do katalogu Nginx
# Vite domyślnie generuje pliki w folderze /dist
COPY --from=build /app/dist /usr/share/nginx/html

# Informujemy o porcie
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]