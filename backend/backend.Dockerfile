# Używamy lekkiej wersji Pythona
FROM python:3.11-slim

# Ustawiamy katalog roboczy w kontenerze
WORKDIR /app

# Instalujemy zależności systemowe niezbędne dla biblioteki psycopg2 (obsługa Postgresa)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Kopiujemy listę bibliotek i instalujemy je
# Najpierw kopiujemy tylko requirements.txt, aby wykorzystać cache Dockera
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Kopiujemy kod źródłowy aplikacji
COPY app.py .

# Informujemy, na którym porcie działa aplikacja
EXPOSE 5000

# Komenda startowa
CMD ["python", "app.py"]
