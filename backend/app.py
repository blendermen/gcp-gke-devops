from flask import Flask, jsonify
from flask_cors import CORS
import psycopg2
import os
import time

app = Flask(__name__)
CORS(app)  # Pozwala frontendowi na zapytania do backendu (Cross-Origin)

# Konfiguracja połączenia pobierana ze zmiennych środowiskowych
# To jest kluczowe dla Azure/Kubernetes!
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_NAME = os.environ.get('DB_NAME', 'postgres')
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASS = os.environ.get('DB_PASSWORD', 'password')

def get_db_connection():
    """Funkcja nawiązująca połączenie z bazą z prostym retry logic."""
    retries = 5
    while retries > 0:
        try:
            conn = psycopg2.connect(
                host=DB_HOST,
                database=DB_NAME,
                user=DB_USER,
                password=DB_PASS
            )
            return conn
        except Exception as e:
            print(f"Błąd połączenia z bazą: {e}. Próbuję ponownie...")
            retries -= 1
            time.sleep(2)
    return None

def init_db():
    """Tworzy tabelę licznika, jeśli nie istnieje."""
    conn = get_db_connection()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute('CREATE TABLE IF NOT EXISTS visit_counter (id serial PRIMARY KEY, count integer);')
            cur.execute('SELECT count(*) FROM visit_counter;')
            if cur.fetchone()[0] == 0:
                cur.execute('INSERT INTO visit_counter (count) VALUES (0);')
            conn.commit()
            cur.close()
            conn.close()
            print("Baza danych zainicjalizowana pomyślnie.")
        except Exception as e:
            print(f"Błąd podczas inicjalizacji bazy: {e}")

# Inicjalizacja przy starcie
init_db()

@app.route('/api/data/visit', methods=['POST'])
def add_visit():
    """Zwiększa licznik w bazie i zwraca aktualną wartość."""
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Baza danych niedostępna"}), 500
    try:
        cur = conn.cursor()
        cur.execute('UPDATE visit_counter SET count = count + 1 RETURNING count;')
        new_count = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"visits": new_count})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
#GCP robi healthchecka na root endpoint, więc dodajemy prosty handler. Bez tego nie będzie działa. Ingress nie bedzie forwardował ruchu do backendu, bo będzie myślał, że jest niedostępny. To jest standardowa praktyka w Kubernetes.
@app.route("/")
def root():
    return "ok", 200

@app.route('/api/status', methods=['GET'])
def get_status():
    """Prosty endpoint do sprawdzania czy API żyje."""
    return jsonify({"status": "ok", "message": "Backend działa!"})

@app.route('/api/data', methods=['GET'])
def get_data():
    """Pobiera wersję bazy i przykładowy rekord."""
    conn = get_db_connection()
    if not conn:
        return jsonify({"error": "Nie można połączyć się z bazą danych"}), 500
    
    try:
        cur = conn.cursor()
        # Zapytanie o wersję bazy (standard w testach)
        cur.execute('SELECT version();')
        db_version = cur.fetchone()[0]
        
        # Przykładowe dane (zwracamy jako JSON)
        data = {
            "database_version": db_version,
            "source": "GKE PostgreSQL instance",
            "timestamp": time.time()
        }
        cur.close()
        conn.close()
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # W kontenerze używamy 0.0.0.0, aby nasłuchiwać na wszystkich interfejsach
    app.run(host='0.0.0.0', port=5000)
